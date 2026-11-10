<?php
/** Shared service for the web UI, Arduino endpoints and WhatsApp. No model-generated SQL. */
class Farm_iot_service
{
    private $db;
    private $sequence=0;
    public function __construct(PDO $db) { $this->db=$db; }
    private function rows($sql,$args=array()) { $q=$this->db->prepare($sql);$q->execute($args);return $q->fetchAll(PDO::FETCH_ASSOC); }
    private function lock() { return $this->db->getAttribute(PDO::ATTR_DRIVER_NAME)==='mysql'?' FOR UPDATE':''; }
    private function atomic($work) {
        $own=!$this->db->inTransaction();$savepoint='farm_iot_'.(++$this->sequence);
        if($own)$this->db->beginTransaction();else $this->db->exec('SAVEPOINT '.$savepoint);
        try{$r=$work();if($own)$this->db->commit();else $this->db->exec('RELEASE SAVEPOINT '.$savepoint);return $r;}
        catch(Throwable $e){if($own)$this->db->rollBack();else{$this->db->exec('ROLLBACK TO SAVEPOINT '.$savepoint);$this->db->exec('RELEASE SAVEPOINT '.$savepoint);}throw $e;}
    }
    public function ready() {
        try{$this->db->query('SELECT output_id FROM farm_iot_output LIMIT 0');return true;}
        catch(PDOException $e){if(in_array($e->getCode(),array('42S02','HY000'),true))return false;throw $e;}
    }
    public function readings($farmId,$hours=24) {
        $hours=max(1,min(168,(int)$hours));
        $latest=$this->rows("SELECT s.sr_id,d.dr_name,d.dr_device_id,s.sr_metric,s.sr_value,s.sr_unit,s.sr_reading_at,s.sr_quality,s.sr_source,s.sr_alert_flag FROM sensor_reading s JOIN device_registry d ON d.dr_id=s.sr_dr_id AND d.farm_id=s.farm_id AND d.dr_status=1 WHERE s.farm_id=? AND s.sr_status=1 AND NOT EXISTS(SELECT 1 FROM sensor_reading n WHERE n.farm_id=s.farm_id AND n.sr_dr_id=s.sr_dr_id AND n.sr_metric=s.sr_metric AND n.sr_status=1 AND (n.sr_reading_at>s.sr_reading_at OR (n.sr_reading_at=s.sr_reading_at AND n.sr_id>s.sr_id))) ORDER BY d.dr_name,s.sr_metric LIMIT 100",array((int)$farmId));
        foreach($latest as &$row){
            $row['origin']=$row['sr_source']==='iot_default_utc'?'default':($row['sr_source']==='iot_gateway_utc'?'device':'record');
            $known=$row['origin']==='device';
            $at=$known?strtotime($row['sr_reading_at'].' UTC'):false;
            $row['last_device_update']=$known?$row['sr_reading_at'].' UTC':null;
            $row['stale']=!$known||$at===false||time()-$at>300||$at>time()+60;
            $row['reading_timezone']=$known?'UTC':'unspecified';
        }unset($row);
        $summary=$this->rows("SELECT s.sr_metric,s.sr_unit,COUNT(*) AS readings,MIN(s.sr_value) AS minimum,MAX(s.sr_value) AS maximum,AVG(s.sr_value) AS average,MIN(s.sr_reading_at) AS first_reading_utc,MAX(s.sr_reading_at) AS last_reading_utc FROM sensor_reading s JOIN device_registry d ON d.dr_id=s.sr_dr_id AND d.farm_id=s.farm_id AND d.dr_status=1 WHERE s.farm_id=? AND s.sr_status=1 AND s.sr_source='iot_gateway_utc' AND s.sr_reading_at>=? GROUP BY s.sr_metric,s.sr_unit",array((int)$farmId,gmdate('Y-m-d H:i:s',time()-$hours*3600)));
        return array('latest'=>$latest,'history_hours'=>$hours,'history_summary'=>$summary);
    }
    public function outputs($farmId) {
        if(!$this->ready())return array();
        $rows=$this->rows('SELECT o.output_key,o.display_name,o.invert_display,o.desired_state,o.reported_state,o.revision,o.reported_revision,o.desired_at,o.reported_at,g.gateway_code,g.last_seen_at,g.enabled AS gateway_enabled FROM farm_iot_output o JOIN farm_iot_gateway g ON g.gateway_id=o.gateway_id AND g.farm_id=o.farm_id JOIN device_registry d ON d.dr_id=g.dr_id AND d.farm_id=g.farm_id WHERE o.farm_id=? AND o.enabled=1 AND d.dr_status=1 ORDER BY o.output_key',array((int)$farmId));
        foreach($rows as &$row){$deviceDesired=$row['desired_state'];$deviceReported=$row['reported_state'];$row['pending']=(int)$row['reported_revision']!==(int)$row['revision']||$deviceReported!==$deviceDesired;$row['device_recently_seen']=$row['gateway_enabled']&&$row['last_seen_at']&&strtotime($row['last_seen_at'].' UTC')>=time()-300;$row['device_desired_state']=$deviceDesired;$row['device_reported_state']=$deviceReported;$row['desired_state']=$this->displayState($deviceDesired,(bool)$row['invert_display']);$row['reported_state']=$this->displayState($deviceReported,(bool)$row['invert_display']);$row['display_desired_state']=$row['desired_state'];$row['display_reported_state']=$row['reported_state'];}unset($row);
        return $rows;
    }
    public function gateways($farmId) { return $this->rows('SELECT gateway_id,gateway_code,enabled,last_seen_at FROM farm_iot_gateway WHERE farm_id=? ORDER BY gateway_id',array((int)$farmId)); }
    private function displayState($state,$inverted) { return $state===null?null:($inverted?($state==='ON'?'OFF':'ON'):$state); }
    public function setOutputDisplay($farmId,$userId,$outputKey,$mode) {
        if(!is_string($outputKey)||!preg_match('/^bulb_[1-9][0-9]*$/D',$outputKey)||!in_array($mode,array('NORMAL','REVERSED'),true))throw new DomainException('Choose a valid bulb and display mode.');
        return $this->atomic(function()use($farmId,$userId,$outputKey,$mode){
            $this->requireWriter($farmId,$userId,'Only farm owners and managers can change bulb display settings.');
            $rows=$this->rows('SELECT output_id,display_name,invert_display FROM farm_iot_output WHERE farm_id=? AND output_key=? AND enabled=1'.$this->lock(),array((int)$farmId,$outputKey));
            if(!$rows)throw new DomainException('That relay is not available on this farm.');$output=$rows[0];
            $inverted=$mode==='REVERSED'?1:0;if((int)$output['invert_display']!==$inverted)$this->db->prepare('UPDATE farm_iot_output SET invert_display=? WHERE output_id=? AND farm_id=?')->execute(array($inverted,$output['output_id'],(int)$farmId));
            return array('output_key'=>$outputKey,'display_name'=>$output['display_name'],'display_mode'=>$mode);
        });
    }
    public function setOutputs($farmId,$userId,$changes,$messageId,$source='whatsapp',$phone=null) {
        if(!is_array($changes)||count($changes)<1||count($changes)>10||!is_string($messageId)||$messageId===''||strlen($messageId)>191)throw new DomainException('Specify a bulb and ON or OFF.');
        $normalized=array();foreach($changes as $change){$key=$change['output_key']??'';$state=$change['state']??'';if(!is_string($key)||!preg_match('/^bulb_[1-9][0-9]*$/D',$key)||!in_array($state,array('ON','OFF','TOGGLE'),true)||isset($normalized[$key]))throw new DomainException('Use one ON or OFF setting per bulb.');$normalized[$key]=$state;}ksort($normalized);
        return $this->atomic(function()use($farmId,$userId,$normalized,$messageId,$source,$phone){
            $member=$this->rows("SELECT m.role FROM farm_membership m JOIN users u ON u.id=m.user_id AND u.active=1 JOIN farm_profile f ON f.fp_id=m.farm_id AND f.fp_status=1 WHERE m.farm_id=? AND m.user_id=? AND m.status='active'".$this->lock(),array((int)$farmId,(int)$userId));
            if(!$member||!in_array($member[0]['role'],array('owner','manager'),true))throw new DomainException('Only farm owners and managers can change bulb settings.');
            if($source==='whatsapp'&&(!$phone||!$this->rows('SELECT user_id FROM whatsapp_account_link WHERE user_id=? AND phone=?'.$this->lock(),array((int)$userId,$phone))))throw new DomainException('Link this WhatsApp number before controlling bulbs.');
            $result=array();foreach($normalized as $key=>$state){
                $found=$this->rows('SELECT o.* FROM farm_iot_output o JOIN farm_iot_gateway g ON g.gateway_id=o.gateway_id AND g.farm_id=o.farm_id AND g.enabled=1 JOIN device_registry d ON d.dr_id=g.dr_id AND d.farm_id=g.farm_id AND d.dr_status=1 WHERE o.farm_id=? AND o.output_key=? AND o.enabled=1'.$this->lock(),array((int)$farmId,$key));
                if(!$found)throw new DomainException('That bulb is not available on this farm.');$o=$found[0];
                $inverted=(bool)$o['invert_display'];$currentState=$this->displayState($o['desired_state'],$inverted);$requestedState=$state==='TOGGLE'?($currentState==='ON'?'OFF':'ON'):$state;$deviceState=$this->displayState($requestedState,$inverted);
                $existing=$this->rows('SELECT desired_state,revision FROM farm_iot_command WHERE farm_id=? AND source_message_id=? AND output_id=?',array((int)$farmId,$messageId,$o['output_id']));
                if($existing){$existingState=$this->displayState($existing[0]['desired_state'],$inverted);if($state!=='TOGGLE'&&$existingState!==$requestedState)throw new DomainException('This message was already processed with a different setting.');$result[]=array('output_key'=>$key,'display_name'=>$o['display_name'],'state'=>$existingState,'revision'=>(int)$existing[0]['revision'],'duplicate'=>true);continue;}
                $revision=(int)$o['revision']+1;$now=gmdate('Y-m-d H:i:s');
                $this->db->prepare('UPDATE farm_iot_output SET desired_state=?,revision=?,desired_at=? WHERE output_id=? AND farm_id=?')->execute(array($deviceState,$revision,$now,$o['output_id'],(int)$farmId));
                $this->db->prepare('INSERT INTO farm_iot_command(farm_id,user_id,output_id,source_message_id,source,desired_state,revision,created_at) VALUES(?,?,?,?,?,?,?,?)')->execute(array((int)$farmId,(int)$userId,$o['output_id'],$messageId,$source,$deviceState,$revision,$now));
                $result[]=array('output_key'=>$key,'display_name'=>$o['display_name'],'state'=>$requestedState,'revision'=>$revision,'duplicate'=>false);
            }return $result;
        });
    }
    public function authenticate($token) {
        if(!is_string($token)||!preg_match('/^[a-f0-9]{64}$/D',$token))throw new DomainException('Invalid device token.');
        $r=$this->rows('SELECT g.gateway_id,g.farm_id,g.dr_id,g.gateway_code FROM farm_iot_gateway g JOIN farm_profile f ON f.fp_id=g.farm_id AND f.fp_status=1 JOIN device_registry d ON d.dr_id=g.dr_id AND d.farm_id=g.farm_id AND d.dr_status=1 WHERE g.token_hash=? AND g.enabled=1',array(hash('sha256',$token)));
        if(!$r)throw new DomainException('Invalid device token.');return $r[0];
    }
    private function seen($gateway) {
        $now=gmdate('Y-m-d H:i:s');
        $this->db->prepare('UPDATE farm_iot_gateway SET last_seen_at=? WHERE gateway_id=? AND farm_id=?')->execute(array($now,$gateway['gateway_id'],$gateway['farm_id']));
        $this->db->prepare("UPDATE device_registry SET dr_online_status='Online',dr_updated_at=? WHERE dr_id=? AND farm_id=?")->execute(array($now,$gateway['dr_id'],$gateway['farm_id']));
    }
    public function poll($token) {
        $g=$this->authenticate($token);$this->seen($g);
        $rows=$this->rows('SELECT output_key,display_name,desired_state,revision,reported_state,reported_revision FROM farm_iot_output WHERE gateway_id=? AND farm_id=? AND enabled=1 ORDER BY output_key',array($g['gateway_id'],$g['farm_id']));
        foreach($rows as &$r){$r['revision']=(int)$r['revision'];$r['reported_revision']=(int)$r['reported_revision'];}unset($r);
        return array('gateway_code'=>$g['gateway_code'],'server_time'=>gmdate('c'),'outputs'=>$rows,'poll_after_seconds'=>5);
    }
    // Raw device states: invert_display is a UI concern, never applied twice here.
    // Gateway credentials identify the board, not a logged-in human (user_id=0).
    public function local_command($token,$payload) {
        $g=$this->authenticate($token);
        $event=$payload['event_id']??null;$key=$payload['output_key']??null;$state=$payload['state']??null;
        if(!is_string($event)||!preg_match('/^[a-f0-9]{32}$/D',$event)||!in_array($key,array('bulb_1','bulb_2'),true)||!in_array($state,array('ON','OFF'),true))throw new DomainException('Supply event_id (32 lowercase hex), bulb_1/bulb_2 and raw ON/OFF state.');
        $message='ble:'.$g['gateway_id'].':'.$event;
        return $this->atomic(function()use($g,$message,$key,$state){
            $found=$this->rows('SELECT * FROM farm_iot_output WHERE gateway_id=? AND farm_id=? AND output_key=? AND enabled=1'.$this->lock(),array($g['gateway_id'],$g['farm_id'],$key));
            if(!$found)throw new DomainException('Output unavailable for this gateway.');$o=$found[0];
            $old=$this->rows('SELECT desired_state,revision FROM farm_iot_command WHERE farm_id=? AND output_id=? AND source_message_id=?',array($g['farm_id'],$o['output_id'],$message));
            if($old){
                if($old[0]['desired_state']!==$state)throw new DomainException('Event already stored with a different state.');
                return array('output_key'=>$key,'state'=>$state,'revision'=>(int)$old[0]['revision'],'duplicate'=>true);
            }
            $revision=(int)$o['revision']+1;$now=gmdate('Y-m-d H:i:s');
            $this->db->prepare('UPDATE farm_iot_output SET desired_state=?,revision=?,desired_at=? WHERE output_id=? AND farm_id=?')->execute(array($state,$revision,$now,$o['output_id'],$g['farm_id']));
            $this->db->prepare('INSERT INTO farm_iot_command(farm_id,user_id,output_id,source_message_id,source,desired_state,revision,created_at) VALUES(?,?,?,?,?,?,?,?)')->execute(array($g['farm_id'],0,$o['output_id'],$message,'bluetooth',$state,$revision,$now));
            $this->seen($g);
            return array('output_key'=>$key,'state'=>$state,'revision'=>$revision,'duplicate'=>false);
        });
    }
    public function telemetry($token,$payload) {
        $g=$this->authenticate($token);$readings=$payload['readings']??null;
        if(!is_array($readings)||!$readings||count($readings)>20)throw new DomainException('Supply 1 to 20 readings.');
        $at=gmdate('Y-m-d H:i:s');
        if(isset($payload['observed_at'])){
            if(!is_string($payload['observed_at'])||!preg_match('/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:Z|[+-]\d{2}:\d{2})$/D',$payload['observed_at']))throw new DomainException('observed_at must be an ISO-8601 timestamp with timezone.');
            $t=strtotime($payload['observed_at']);if($t===false||$t>time()+60||$t<time()-86400)throw new DomainException('Reading time must be within the last 24 hours.');$at=gmdate('Y-m-d H:i:s',$t);
        }
        $valid=array();foreach($readings as $r){$metric=$r['metric']??'';$value=$r['value']??null;
            if(!in_array($metric,array('temperature','humidity'),true)||!is_numeric($value)||is_bool($value)||!is_finite((float)$value))throw new DomainException('Use temperature or humidity and a numeric value.');
            $v=(float)$value;if(($metric==='temperature'&&($v< -50||$v>100))||($metric==='humidity'&&($v<0||$v>100)))throw new DomainException('Sensor value outside its accepted range.');
            if(isset($valid[$metric]))throw new DomainException('Duplicate metric in one update.');$valid[$metric]=$v;
        }
        return $this->atomic(function()use($g,$valid,$at){
            foreach($valid as $metric=>$value){$this->db->prepare("INSERT INTO sensor_reading(farm_id,sr_dr_id,sr_metric,sr_value,sr_unit,sr_reading_at,sr_quality,sr_source,sr_status,sr_created_at) VALUES(?,?,?,?,?,?,'Good','iot_gateway_utc',1,?)")->execute(array($g['farm_id'],$g['dr_id'],$metric,$value,$metric==='temperature'?'°C':'%',$at,gmdate('Y-m-d H:i:s')));
                $this->evaluateRules($g,$metric,$value,$at,(int)$this->db->lastInsertId());
            }
            $this->db->prepare('UPDATE device_registry SET dr_last_reading_at=CASE WHEN dr_last_reading_at<? THEN ? ELSE dr_last_reading_at END WHERE dr_id=? AND farm_id=?')->execute(array($at,$at,$g['dr_id'],$g['farm_id']));$this->seen($g);
            return array('stored'=>count($valid),'observed_at'=>$at.' UTC');
        });
    }
    public function acknowledge($token,$payload) {
        $g=$this->authenticate($token);$items=$payload['outputs']??null;
        if(!is_array($items)||!$items||count($items)>20)throw new DomainException('Supply 1 to 20 output reports.');
        return $this->atomic(function()use($g,$items){$results=array();$seen=array();foreach($items as $item){
            $key=$item['output_key']??'';$state=$item['state']??'';$revision=$item['revision']??null;
            if(!is_string($key)||!in_array($state,array('ON','OFF'),true)||!is_int($revision)||$revision<0||isset($seen[$key]))throw new DomainException('Each output needs a unique key, ON/OFF state and integer revision.');$seen[$key]=true;
            $rows=$this->rows('SELECT * FROM farm_iot_output WHERE farm_id=? AND gateway_id=? AND output_key=? AND enabled=1'.$this->lock(),array($g['farm_id'],$g['gateway_id'],$key));
            if(!$rows)throw new DomainException('Unknown output.');$o=$rows[0];
            if($revision>(int)$o['revision'])throw new DomainException('Unknown future revision.');
            if($revision<(int)$o['reported_revision']){$results[]=array('output_key'=>$key,'accepted'=>false,'reason'=>'older_revision');continue;}
            $this->db->prepare('UPDATE farm_iot_output SET reported_state=?,reported_revision=?,reported_at=? WHERE output_id=? AND farm_id=?')->execute(array($state,$revision,gmdate('Y-m-d H:i:s'),$o['output_id'],$g['farm_id']));
            $results[]=array('output_key'=>$key,'accepted'=>true,'applied'=>$revision===(int)$o['revision']&&$state===$o['desired_state']);
        }$this->seen($g);return array('outputs'=>$results);});
    }
    public function rules($farmId,$enabled=null) {
        if(!$this->ready())return array();
        return $this->rows('SELECT rule_id,output_key,metric,comparison,threshold_value,action,enabled,last_evaluated_at,last_triggered_at FROM farm_iot_rule WHERE farm_id=?'.($enabled===null?'':' AND enabled=' . ($enabled?1:0)).' ORDER BY rule_id DESC LIMIT 100',array((int)$farmId));
    }
    private function requireWriter($farmId,$userId,$message='Only farm owners and managers can change automation rules.') {
        $r=$this->rows("SELECT m.role FROM farm_membership m JOIN users u ON u.id=m.user_id AND u.active=1 JOIN farm_profile f ON f.fp_id=m.farm_id AND f.fp_status=1 WHERE m.farm_id=? AND m.user_id=? AND m.status='active'".$this->lock(),array((int)$farmId,(int)$userId));
        if(!$r||!in_array($r[0]['role'],array('owner','manager'),true))throw new DomainException($message);
    }
    public function createRule($farmId,$userId,$rule,$messageId,$phone=null) {
        $key=$rule['output_key']??'';$metric=$rule['metric']??'';$cmp=$rule['comparison']??'';$value=$rule['threshold']??null;$action=$rule['state']??'';
        if(!is_string($key)||!preg_match('/^bulb_[1-9][0-9]*$/D',$key)||!in_array($metric,array('temperature','humidity'),true)||!in_array($cmp,array('gt','gte','lt','lte'),true)||!in_array($action,array('ON','OFF','TOGGLE'),true)||!is_numeric($value)||is_bool($value)||!is_finite((float)$value))throw new DomainException('Specify a bulb, temperature/humidity threshold, above/below comparison, and ON/OFF/toggle action.');
        $v=(float)$value;if(($metric==='temperature'&&($v< -50||$v>100))||($metric==='humidity'&&($v<0||$v>100))||!is_string($messageId)||$messageId===''||strlen($messageId)>191)throw new DomainException('Invalid rule threshold or request.');
        return $this->atomic(function()use($farmId,$userId,$key,$metric,$cmp,$v,$action,$messageId,$phone){
            $this->requireWriter($farmId,$userId);
            if($phone!==null&&!$this->rows('SELECT user_id FROM whatsapp_account_link WHERE user_id=? AND phone=?'.$this->lock(),array((int)$userId,$phone)))throw new DomainException('Link this WhatsApp number first.');
            $existing=$this->rows('SELECT * FROM farm_iot_rule WHERE farm_id=? AND source_message_id=?',array((int)$farmId,$messageId));if($existing)return $existing[0];
            $out=$this->rows('SELECT o.gateway_id FROM farm_iot_output o JOIN farm_iot_gateway g ON g.gateway_id=o.gateway_id AND g.farm_id=o.farm_id AND g.enabled=1 JOIN device_registry d ON d.dr_id=g.dr_id AND d.farm_id=g.farm_id AND d.dr_status=1 WHERE o.farm_id=? AND o.output_key=? AND o.enabled=1'.$this->lock(),array((int)$farmId,$key));
            if(!$out)throw new DomainException('That bulb is not available on this farm.');
            if((int)$this->rows('SELECT COUNT(*) AS n FROM farm_iot_rule WHERE farm_id=? AND enabled=1',array((int)$farmId))[0]['n']>=50)throw new DomainException('Disable an existing rule before adding more.');
            $this->db->prepare('INSERT INTO farm_iot_rule(farm_id,user_id,gateway_id,output_key,metric,comparison,threshold_value,action,source_message_id,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)')->execute(array((int)$farmId,(int)$userId,$out[0]['gateway_id'],$key,$metric,$cmp,$v,$action,$messageId,gmdate('Y-m-d H:i:s')));
            return array('rule_id'=>(int)$this->db->lastInsertId(),'output_key'=>$key,'metric'=>$metric,'comparison'=>$cmp,'threshold_value'=>$v,'action'=>$action);
        });
    }
    public function disableRule($farmId,$userId,$ruleId,$phone=null) {
        return $this->atomic(function()use($farmId,$userId,$ruleId,$phone){
            $this->requireWriter($farmId,$userId);
            if($phone!==null&&!$this->rows('SELECT user_id FROM whatsapp_account_link WHERE user_id=? AND phone=?'.$this->lock(),array((int)$userId,$phone)))throw new DomainException('Link this WhatsApp number first.');
            $r=$this->rows('SELECT rule_id FROM farm_iot_rule WHERE farm_id=? AND rule_id=?'.$this->lock(),array((int)$farmId,(int)$ruleId));if(!$r)throw new DomainException('That rule is not on this farm.');
            $this->db->prepare('UPDATE farm_iot_rule SET enabled=0 WHERE farm_id=? AND rule_id=?')->execute(array((int)$farmId,(int)$ruleId));return true;
        });
    }
    private function evaluateRules($gateway,$metric,$value,$at,$readingId) {
        // Delayed readings are stored for history but never actuate equipment.
        if(strtotime($at.' UTC')<time()-300)return;
        $rules=$this->rows('SELECT * FROM farm_iot_rule WHERE farm_id=? AND gateway_id=? AND metric=? AND enabled=1 ORDER BY rule_id'.$this->lock(),array($gateway['farm_id'],$gateway['gateway_id'],$metric));
        foreach($rules as $r){
            if($readingId<=(int)$r['last_reading_id']||($r['last_evaluated_at']&&$at<$r['last_evaluated_at']))continue;
            $writers=$this->rows("SELECT m.role FROM farm_membership m JOIN users u ON u.id=m.user_id AND u.active=1 WHERE m.farm_id=? AND m.user_id=? AND m.status='active'",array($gateway['farm_id'],$r['user_id']));
            if(!$writers||!in_array($writers[0]['role'],array('owner','manager'),true)){$this->db->prepare('UPDATE farm_iot_rule SET enabled=0 WHERE rule_id=? AND farm_id=?')->execute(array($r['rule_id'],$gateway['farm_id']));continue;}
            $available=$this->rows('SELECT output_id FROM farm_iot_output WHERE farm_id=? AND gateway_id=? AND output_key=? AND enabled=1',array($gateway['farm_id'],$gateway['gateway_id'],$r['output_key']));
            if(!$available){$this->db->prepare('UPDATE farm_iot_rule SET enabled=0 WHERE rule_id=? AND farm_id=?')->execute(array($r['rule_id'],$gateway['farm_id']));continue;}
            $threshold=(float)$r['threshold_value'];$met=false;
            switch($r['comparison']){case 'gt':$met=$value>$threshold;break;case 'gte':$met=$value>=$threshold;break;case 'lt':$met=$value<$threshold;break;case 'lte':$met=$value<=$threshold;break;}
            if($met&&!(int)$r['last_condition']){
                $this->setOutputs($gateway['farm_id'],$r['user_id'],array(array('output_key'=>$r['output_key'],'state'=>$r['action'])),'rule:'.$r['rule_id'].':reading:'.$readingId,'automation');
                $this->db->prepare('UPDATE farm_iot_rule SET last_triggered_at=? WHERE rule_id=? AND farm_id=?')->execute(array(gmdate('Y-m-d H:i:s'),$r['rule_id'],$gateway['farm_id']));
            }
            $this->db->prepare('UPDATE farm_iot_rule SET last_condition=?,last_reading_id=?,last_evaluated_at=? WHERE rule_id=? AND farm_id=?')->execute(array($met?1:0,$readingId,$at,$r['rule_id'],$gateway['farm_id']));
        }
    }

}

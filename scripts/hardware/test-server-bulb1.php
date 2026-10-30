<?php
// Operator-authorized real Bulb 1 test. Default mode is read-only.
if (PHP_SAPI !== 'cli') exit(1);
require '/var/www/DairyOS_whatsapp_ai/app/bootstrap.php';
require '/var/www/DairyOS_whatsapp_ai/app/farm_assistant.php';
$db = dairy_db();
$q = $db->prepare('SELECT fp_id,fp_code FROM farm_profile WHERE fp_code=? AND fp_status=1');
$q->execute(['FARM004']); $farms = $q->fetchAll(PDO::FETCH_ASSOC);
if (count($farms) !== 1) throw new RuntimeException('Expected one active FARM004.');
$farm = $farms[0]; $farmId = (int)$farm['fp_id']; $iot = new Farm_iot_service($db);
function bulb($iot, $farmId, $key) { foreach ($iot->outputs($farmId) as $row) if ($row['output_key'] === $key) return $row; throw new RuntimeException('Output not configured.'); }
$before = bulb($iot,$farmId,'bulb_1'); $other = bulb($iot,$farmId,'bulb_2');
if (!in_array('--execute',$argv,true)) { echo json_encode(['farm'=>$farm['fp_code'],'bulb_1'=>$before,'bulb_2'=>$other],JSON_PRETTY_PRINT),"\n"; exit; }
if ((int)$before['invert_display'] !== 1) throw new RuntimeException('Expected commissioned normally-ON Bulb 1. No command sent.');
if (!$before['device_recently_seen']) throw new RuntimeException('Gateway is stale. No command sent.');
$q=$db->prepare("SELECT m.user_id FROM farm_membership m JOIN users u ON u.id=m.user_id AND u.active=1 WHERE m.farm_id=? AND m.role='owner' AND m.status='active' ORDER BY m.user_id LIMIT 1");
$q->execute([$farmId]);$actor=(int)$q->fetchColumn();if(!$actor)throw new RuntimeException('No active authorized owner.');
$run=gmdate('Ymd\THis\Z').'-'.bin2hex(random_bytes(3));$path='/tmp/dairyos-bulb1-test-'.$run.'.json';
$report=['run'=>$run,'farm'=>$farm['fp_code'],'startedAt'=>gmdate('c'),'before'=>$before,'bulb2Before'=>$other,'steps'=>[],'error'=>null,'restored'=>false];
$lastRevision=null;
$save=function()use(&$report,$path){file_put_contents($path,json_encode($report,JSON_PRETTY_PRINT|JSON_UNESCAPED_SLASHES)."\n",LOCK_EX);};
$wait=function($revision,$state)use($iot,$farmId){$deadline=microtime(true)+22;do{$row=bulb($iot,$farmId,'bulb_1');if((int)$row['revision']!==$revision)throw new RuntimeException('Output changed by another controller; test stopped.');if(!$row['pending']&&(int)$row['reported_revision']===$revision&&$row['display_reported_state']===$state)return $row;usleep(400000);}while(microtime(true)<$deadline);throw new RuntimeException('No matching physical gateway acknowledgment within22 seconds.');};
$save();echo "Report: $path\n";flush();
try{
 foreach(['ON','OFF'] as $logical){
  $result=$iot->setOutputs($farmId,$actor,[['output_key'=>'bulb_1','state'=>$logical]],'ble-bulb1-'.$run.'-'.$logical,'ble-validation');
  $lastRevision=(int)$result[0]['revision'];
  $step=['requestedAt'=>gmdate('c'),'logicalBulb'=>$logical,'expectedDeviceState'=>$logical==='ON'?'OFF':'ON','revision'=>$lastRevision];
  $report['steps'][]=$step;$save();
  $actual=$wait($lastRevision,$logical);$index=count($report['steps'])-1;
  $report['steps'][$index]['acknowledgedAt']=gmdate('c');$report['steps'][$index]['actual']=$actual;$save();
  echo json_encode(['logicalBulb'=>$logical,'device'=>$actual['device_reported_state'],'revision'=>$lastRevision,'acknowledged'=>true]),"\n";flush();
  sleep(2);
 }
}catch(Throwable $e){$report['error']=$e->getMessage();echo 'Test error: '.$e->getMessage(),"\n";}
finally{
 try{
  $current=bulb($iot,$farmId,'bulb_1');
  if($lastRevision!==null && (int)$current['revision']===$lastRevision){
   $result=$iot->setOutputs($farmId,$actor,[['output_key'=>'bulb_1','state'=>$before['display_desired_state']]],'ble-bulb1-'.$run.'-restore','ble-validation');
   $lastRevision=(int)$result[0]['revision'];$report['restoration']=$wait($lastRevision,$before['display_desired_state']);$report['restored']=true;
  }elseif($lastRevision===null){$report['restored']=true;}
  else{$report['restorationSkipped']='A later external command must not be overwritten.';}
 }catch(Throwable $e){$report['restorationError']=$e->getMessage();}
 $report['bulb2After']=bulb($iot,$farmId,'bulb_2');$report['completedAt']=gmdate('c');$save();echo 'Restored: '.($report['restored']?'yes':'no')."\nReport: $path\n";
}
exit($report['error']||!$report['restored']?1:0);

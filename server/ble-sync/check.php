<?php
if(PHP_SAPI!=='cli')exit(1);
require '/var/www/DairyOS_whatsapp_ai/app/bootstrap.php';
require_once __DIR__.'/Farm_iot_service.php';
$config=[];
foreach(['/var/www/DairyOS/.env','/var/www/DairyOS_whatsapp_ai/.env'] as $file){foreach(is_readable($file)?file($file,FILE_IGNORE_NEW_LINES):[] as $line){$line=trim($line);if($line===''||$line[0]==='#'||$line[0]===';'||!str_contains($line,'='))continue;[$key,$value]=array_map('trim',explode('=',$line,2));$config[$key]=trim($value,"\"'");}}
$db=new PDO('mysql:host='.($config['DB_HOST']??'localhost').';port='.($config['DB_PORT']??'3306').';dbname='.($config['DB_DATABASE']??'DairyOS').';charset=utf8mb4',$config['DB_USERNAME']??'DairyOS',$config['DB_PASSWORD']??'',[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION,PDO::ATTR_EMULATE_PREPARES=>false]);unset($config);$service=new Farm_iot_service($db);
$credentials=json_decode(file_get_contents('/etc/dairyos-iot/farm004-gateway.json'),true);$token=$credentials['token'];unset($credentials);
$n=0;
function check($ok,$message){global $n;if(!$ok)throw new RuntimeException($message);++$n;echo 'PASS '.$message."\n";}
function denied($work,$message){try{$work();}catch(DomainException $e){check(true,$message);return;}throw new RuntimeException($message.' accepted');}
$db->beginTransaction();try{
 $g=$service->authenticate($token);
 $q=$db->prepare('SELECT * FROM farm_iot_output WHERE gateway_id=? AND output_key=?');$q->execute([$g['gateway_id'],'bulb_1']);$before=$q->fetch(PDO::FETCH_ASSOC);
 $event=bin2hex(random_bytes(16));$payload=['event_id'=>$event,'output_key'=>'bulb_1','state'=>'ON'];
 $r=$service->local_command($token,$payload);
 check($r['revision']==(int)$before['revision']+1,'BLE sync creates a new desired revision');
 $q->execute([$g['gateway_id'],'bulb_1']);$now=$q->fetch(PDO::FETCH_ASSOC);
 check($now['desired_state']==='ON','raw relay state stored without double inversion');
 check($now['reported_revision']===$before['reported_revision']&&$now['reported_state']===$before['reported_state'],'sync never fabricates a hardware acknowledgment');
 $again=$service->local_command($token,$payload);check($again['duplicate']&&$again['revision']===$r['revision'],'lost-response retry is idempotent');
 denied(fn()=>$service->local_command($token,array_merge($payload,['state'=>'OFF'])),'same event cannot change meaning');
 denied(fn()=>$service->local_command($token,array_merge($payload,['output_key'=>'bulb_99'])),'unknown target rejected');
 denied(fn()=>$service->local_command(str_repeat('a',64),$payload),'unauthenticated gateway rejected');
 denied(fn()=>$service->local_command($token,array_merge($payload,['event_id'=>'bad'])),'malformed event rejected');
 $new=$service->local_command($token,['event_id'=>bin2hex(random_bytes(16)),'output_key'=>'bulb_1','state'=>'OFF']);
 $service->local_command($token,$payload);$q->execute([$g['gateway_id'],'bulb_1']);$latest=$q->fetch(PDO::FETCH_ASSOC);
 check($latest['desired_state']==='OFF'&&(int)$latest['revision']===$new['revision'],'delayed duplicate cannot overwrite a newer instruction');
 $ack=$service->acknowledge($token,['outputs'=>[['output_key'=>'bulb_1','state'=>'OFF','revision'=>$new['revision']]]]);check($ack[0]['applied']??$ack['outputs'][0]['applied']??false,'exact new revision can be acknowledged');
 $a=$db->prepare('SELECT source,user_id FROM farm_iot_command WHERE output_id=? AND revision=?');$a->execute([$before['output_id'],$new['revision']]);$audit=$a->fetch(PDO::FETCH_ASSOC);
 check($audit['source']==='bluetooth'&&(int)$audit['user_id']===0,'gateway audit is not attributed to a human account');
}finally{$db->rollBack();}
echo json_encode(['passed'=>$n,'databaseChanges'=>'rolled back','hardwareCommands'=>0])."\n";

<?php
if(!defined('BASEPATH'))exit('No direct script access allowed');
require_once APPPATH.'libraries/Farm_iot_service.php';
class Iot_api extends CI_Controller
{
    private function service() {
        $this->load->database();$d=$this->db;
        return new Farm_iot_service(new PDO('mysql:host='.$d->hostname.';port='.($d->port?:3306).';dbname='.$d->database.';charset=utf8mb4',$d->username,$d->password,array(PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION,PDO::ATTR_EMULATE_PREPARES=>false)));
    }
    public function poll() { $this->handle('poll','GET'); }
    public function local_command() { $this->handle('local_command','POST'); }
    public function telemetry() { $this->handle('telemetry','POST'); }
    public function acknowledge() { $this->handle('acknowledge','POST'); }
    private function handle($operation,$method) {
        if(strtoupper((string)$this->input->server('REQUEST_METHOD'))!==$method)return $this->respond(405,array('ok'=>false,'error'=>'method_not_allowed'));
        $header=(string)$this->input->get_request_header('Authorization',true);
        if(!preg_match('/^Bearer ([a-f0-9]{64})$/D',$header,$m))return $this->respond(401,array('ok'=>false,'error'=>'invalid_device_token'));
        try{$service=$this->service();$service->authenticate($m[1]);}catch(DomainException $e){return $this->respond(401,array('ok'=>false,'error'=>'invalid_device_token'));}catch(Throwable $e){log_message('error','IoT authentication/storage unavailable.');return $this->respond(503,array('ok'=>false,'error'=>'temporarily_unavailable'));}
        try{
            $payload=array();if($method==='POST'){
                if((int)$this->input->server('CONTENT_LENGTH')>16384)return $this->respond(413,array('ok'=>false,'error'=>'payload_too_large'));
                $raw=file_get_contents('php://input',false,null,0,16385);if(strlen($raw)>16384)return $this->respond(413,array('ok'=>false,'error'=>'payload_too_large'));
                $payload=json_decode($raw,true);if(!is_array($payload)||json_last_error()!==JSON_ERROR_NONE)throw new DomainException('Send a JSON object.');
            }
            $result=$operation==='poll'?$service->poll($m[1]):$service->$operation($m[1],$payload);
            return $this->respond(200,array('ok'=>true)+$result);
        }catch(DomainException $e){return $this->respond(422,array('ok'=>false,'error'=>$e->getMessage()));}
        catch(Throwable $e){log_message('error','IoT request failed: '.get_class($e));return $this->respond(503,array('ok'=>false,'error'=>'temporarily_unavailable'));}
    }
    private function respond($status,$body) { $this->output->set_status_header($status,$status===422?'Unprocessable Entity':'')->set_header('Cache-Control: no-store')->set_content_type('application/json')->set_output(json_encode($body,JSON_UNESCAPED_UNICODE)); }
}

import os
import tempfile
import unittest
from coordinator import Coordinator

class Bridge:
    def __init__(self): self.calls=[]; self.states=[False,False]; self.fail=False
    def call(self,name,*args,**kw):
        if name=='dairyos_snapshot': return '2500,5000,1,%d,%d,1' % tuple(self.states)
        self.calls.append((name,args))
        if self.fail: raise TimeoutError('uncertain')
        self.states[args[0]-1]=bool(args[1])
        return True
class API:
    def __init__(self): self.events={};self.revision=40;self.state='OFF';self.poll_hook=None;self.fail_after_commit=False;self.acks=[]
    def local_command(self,p):
        if p['event_id'] not in self.events:
            self.revision+=1;self.state=p['state']
            self.events[p['event_id']]={'output_key':p['output_key'],'state':p['state'],'revision':self.revision}
        if self.fail_after_commit: self.fail_after_commit=False;raise TimeoutError('response lost')
        return self.events[p['event_id']]
    def poll(self):
        reply={'outputs':[{'output_key':'bulb_1','desired_state':self.state,'revision':self.revision}]}
        if self.poll_hook: self.poll_hook()
        return reply
    def acknowledge(self,p):self.acks.append(p)
class Tests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.path=os.path.join(self.temp.name,'state.db');self.bridge=Bridge();self.c=Coordinator(self.path,self.bridge);self.api=API()
    def tearDown(self):self.c.db.close();self.temp.cleanup()
    def test_untimed_off_for_normally_on_is_latched_raw_on(self):
        self.c.local(1,2,0);self.assertEqual(self.bridge.calls,[('dairyos_latch',(1,True))]);self.assertTrue(self.c.pending())
        self.c.cycle(self.api);self.assertEqual(len(self.bridge.calls),1);self.assertFalse(self.c.pending());self.assertEqual(self.api.state,'ON')
    def test_poll_already_inflight_never_overwrites_new_ble(self):
        self.api.poll_hook=lambda:self.c.local(1,2,0)
        self.c.cycle(self.api);self.assertEqual(self.bridge.calls,[('dairyos_latch',(1,True))]);self.assertTrue(self.c.pending())
    def test_lost_http_receipt_retries_same_event_without_hardware_resend(self):
        self.c.local(1,2,0);self.api.fail_after_commit=True
        with self.assertRaises(TimeoutError):self.c.cycle(self.api)
        self.assertTrue(self.c.pending());self.c.cycle(self.api)
        self.assertEqual(len(self.api.events),1);self.assertEqual(self.api.revision,41);self.assertEqual(len(self.bridge.calls),1)
    def test_offline_queue_survives_process_restart_without_replaying_gpio(self):
        self.c.local(1,2,0);self.c.db.close();self.c=Coordinator(self.path,self.bridge)
        self.assertTrue(self.c.pending());self.c.cycle(self.api);self.assertEqual(len(self.bridge.calls),1)
    def test_uncertain_mcu_call_blocks_cloud_and_is_never_replayed_on_restart(self):
        self.bridge.fail=True
        with self.assertRaises(TimeoutError):self.c.local(1,2,0)
        self.c.db.close();self.c=Coordinator(self.path,self.bridge);self.bridge.fail=False
        self.c.cycle(self.api);self.assertTrue(self.c.pending());self.assertEqual(len(self.bridge.calls),1)
        self.c.local(1,0,0);self.c.cycle(self.api);self.assertFalse(self.c.pending())
    def test_newer_web_revision_applies_once_after_sync(self):
        self.c.local(1,2,0);self.c.cycle(self.api);self.api.state='OFF';self.api.revision+=1
        self.c.cycle(self.api);self.c.cycle(self.api)
        self.assertEqual(self.bridge.calls,[('dairyos_latch',(1,True)),('dairyos_latch',(1,False))])
    def test_explicit_timer_expiry_is_queued_so_cloud_cannot_reenergize(self):
        self.c.local(1,1,5);self.c.cycle(self.api)
        self.assertEqual(self.bridge.calls,[('dairyos_set',(1,5))])
        self.c.db.execute('UPDATE output SET expires=0 WHERE target=1');self.c.expire_timers();self.c.cycle(self.api)
        self.assertEqual(self.bridge.calls,[('dairyos_set',(1,5)),('dairyos_set',(1,0))]);self.assertEqual(self.api.state,'OFF')
    def test_pending_sequence_keeps_last_offline_instruction(self):
        self.c.local(1,2,0);self.c.local(1,0,0);self.c.cycle(self.api)
        self.assertEqual(self.api.state,'OFF');self.assertEqual(len(self.api.events),2);self.assertEqual(len(self.bridge.calls),2)
    def test_new_online_instruction_supersedes_an_earlier_timer(self):
        self.c.local(1,1,5);self.c.cycle(self.api);self.api.state='OFF';self.api.revision+=1
        self.c.cycle(self.api)
        self.assertEqual(self.bridge.calls[-1],('dairyos_latch',(1,False)))
        self.assertIsNone(self.c.db.execute('SELECT expires FROM output WHERE target=1').fetchone()[0])
    def test_interlock_release_reports_actual_state_without_reenergizing(self):
        self.c.local(1,2,0);self.c.cycle(self.api);self.bridge.states[0]=False
        self.c.cycle(self.api)
        self.assertEqual(len(self.bridge.calls),1)
        self.assertEqual(self.api.acks[-1]['outputs'][0]['state'],'OFF')
    def test_invalid_commands_never_touch_hardware(self):
        for args in [(3,2,0),(1,2,5),(1,1,0),(1,1,31),(1,0,5)]:
            with self.assertRaises(ValueError):self.c.local(*args)
        self.assertEqual(self.bridge.calls,[])
if __name__=='__main__':unittest.main()

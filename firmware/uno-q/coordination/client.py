import json
import socket

class OutputClient:
    def request(self, value):
        with socket.socket(socket.AF_UNIX, socket.SOCK_STREAM) as connection:
            connection.settimeout(3)
            connection.connect('/run/dairyos-output/control.sock')
            connection.sendall((json.dumps(value)+'\n').encode())
            with connection.makefile('rb') as stream:
                reply = json.loads(stream.readline(4096))
        if reply.get('ok') is not True: raise RuntimeError('Output not confirmed; no automatic retry')
        return reply['result']
    def command(self, target, opcode, seconds):
        return self.request({'command': 'set', 'target': target, 'opcode': opcode, 'seconds': seconds})
    def pending(self): return self.request({'command': 'pending'})

const child_process = require('child_process');
const os   = require('os');
const chai = require('chai');
const expect = chai.expect;
const path = require('path');

const util = require('../../lib/util');

describe('node-virtualbox should create micro vm with shared folder, and stop and destroy it', function() {
    this.timeout(2000000);
    it('should create micro vm', function(done) {
        let testSharedPath = path.join(os.homedir(),'.baker');
        var child = child_process.exec(`node bin.js --micro --vmname "micro-vm" --ssh_port 2050 --verbose --sync "${testSharedPath};/data"`, 
                                       {}, function(error, stdout, stderr) 
        {
            if( error ) console.log(stderr || stdout);
            expect(error).to.be.null;
            done();
        });
        child.stdout.pipe(process.stdout);
    });

    it('should have shared folder in micro vm', async function() 
    {
        let cmd = `ls /data`;
        let sshKeyPath = path.join('config','resources','baker_rsa');
        let buffer = await util.sshExec(cmd, {port: 2050, user: 'root', private_key: sshKeyPath}, 60000);
        expect(buffer).to.include('boxes');
    });

    it('should stop micro vm', function(done) {
        // echo value for prompt input for password.
        var child = child_process.exec(`node bin.js --stop --vmname "micro-vm"`, 
                                       {}, function(error, stdout, stderr) 
        {
            if( error ) console.log(stderr || stdout);
            expect(error).to.be.null;
            
            done();
        });
        child.stdout.pipe(process.stdout);
    });

    it('should destroy micro vm', function(done) {
        // echo value for prompt input for password.
        var child = child_process.exec(`node bin.js --delete --vmname "micro-vm"`, 
                                       {}, function(error, stdout, stderr) 
        {
            if( error ) console.log(stderr || stdout);
            expect(error).to.be.null;
            
            done();
        });
        child.stdout.pipe(process.stdout);
    });

});

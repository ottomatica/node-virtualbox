const child_process = require('child_process');
const chai = require('chai');
const expect = chai.expect;
const path = require('path');

const util = require('../../lib/util');

describe('node-virtualbox should create vm with shared folder, and stop and destroy it', function() {
    this.timeout(2000000);
    it('should create vm', function(done) {
        let testSharedPath = __dirname;
        var child = child_process.exec(`node bin.js --provision --vmname "shared-folders-vm" --ip 172.16.1.47 --port 2097 --verbose --sync "${testSharedPath};/testShare"`, 
                                       {}, function(error, stdout, stderr) 
        {
            if( error ) console.log(stderr || stdout);
            expect(error).to.be.null;
            done();
        });
        child.stdout.pipe(process.stdout);
    });

    it('should have shared folder in vm', async function() 
    {
        let cmd = `ls /testShare`;
        let sshKeyPath = path.join('config','resources','insecure_private_key');
        let buffer = await util.sshExec(cmd, {port: 2097, user: 'vagrant', private_key: sshKeyPath}, 60000);
        expect(buffer).to.include('shared_folders.js');
    });

    it('should stop vm', function(done) {
        // echo value for prompt input for password.
        var child = child_process.exec(`node bin.js --stop --vmname "shared-folders-vm"`, 
                                       {}, function(error, stdout, stderr) 
        {
            if( error ) console.log(stderr || stdout);
            expect(error).to.be.null;
            
            done();
        });
        child.stdout.pipe(process.stdout);
    });

    it('should destroy vm', function(done) {
        // echo value for prompt input for password.
        var child = child_process.exec(`node bin.js --delete --vmname "shared-folders-vm"`, 
                                       {}, function(error, stdout, stderr) 
        {
            if( error ) console.log(stderr || stdout);
            expect(error).to.be.null;
            
            done();
        });
        child.stdout.pipe(process.stdout);
    });

});

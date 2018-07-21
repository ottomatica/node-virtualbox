const child_process = require('child_process');
const chai = require('chai');
const expect = chai.expect;
const os = require('os');
const path = require('path');
const fs = require('fs-extra');

describe('node-virtualbox should create pingable vm, and stop and destroy it', function() {
    this.timeout(2000000);
    it('should create pingable vm', function(done) {
        // echo value for prompt input for password.
        var child = child_process.exec(`node bin.js --provision --vmname "sanity-check-vm" --ip 172.16.1.44 --port 2092 --verbose`, 
                                       {}, function(error, stdout, stderr) 
        {
            if( error ) console.log(stderr || stdout);
            expect(error).to.be.null;

            let cmd = process.platform === 'win32' ? `ping 172.16.1.44 -n 5` : `ping 172.16.1.44 -c 5`
            let output = child_process.execSync(cmd).toString();
            console.log(output);
            expect(output).to.include('time=');

            done();
        });
        child.stdout.pipe(process.stdout);
    });

    it('should stop vm', function(done) {
        // echo value for prompt input for password.
        var child = child_process.exec(`node bin.js --stop --vmname "sanity-check-vm"`, 
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
        var child = child_process.exec(`node bin.js --delete --vmname "sanity-check-vm"`, 
                                       {}, function(error, stdout, stderr) 
        {
            if( error ) console.log(stderr || stdout);
            expect(error).to.be.null;
            
            done();
        });
        child.stdout.pipe(process.stdout);
    });

});

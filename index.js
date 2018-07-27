/**
 * @module virtualbox
 */

const path          = require('path');
const fs            = require('fs');

const download      = require('download');
const tar           = require('tar');

const util          = require('./lib/util');
const VBoxProvider  = require('./lib/VBoxProvider');

module.exports = async function (options = {}) {
    let provider = new VBoxProvider();

    if( !options.ssh_port && (options.provision || options.micro) )
    {
        options.ssh_port = await util.findAvailablePort(provider, options.verbose);
    }

    if( !options.cpus && (options.provision || options.micro) )
    {
        options.cpus = options.provision ? 2: 1;
    }

    if( !options.mem && (options.provision || options.micro) )
    {
        options.mem = options.provision ? 1024: 512;
    }

    if(options.micro) {
        try {
            let iso = 'https://github.com/ottomatica/baker-release/releases/download/0.6.0/alpine.iso';
            const boxesPath = path.join(require('os').userInfo().homedir, '.baker', 'boxes');
            const isoPath = options.attach_iso || path.join(boxesPath, 'alpine.iso');
            if (!(await fs.existsSync(path.join(boxesPath, 'alpine.iso')))) {
                await download(iso, boxesPath);
            }
    
            provider.micro(options.vmname, options.cpus, options.mem, isoPath, options.ssh_port, path.join(__dirname,'config/resources/baker_rsa'), options.syncs, options.disk, options.verbose);
       } catch (error) {
            console.error('=> exec error:', error);
        }
    }

    if(options.provision) {

        if( !options.ovf )
        {
            const boxesPath = path.join(require('os').userInfo().homedir, '.baker', 'boxes');
            const unpackPath = path.join(boxesPath, 'ubuntu-xenial');

            util.mkDirByPathSync(boxesPath);
            util.mkDirByPathSync(unpackPath);

            // download files if not available locally
            if (!(await fs.existsSync(path.join(unpackPath, 'box.ovf')))) {
                console.log("no --ovf specified, downloading latest ubuntu box!")
                await download('http://cloud-images.ubuntu.com/xenial/current/xenial-server-cloudimg-amd64-vagrant.box', boxesPath);
                await tar.x(  // or tar.extract(
                    {
                      file: path.join(boxesPath, 'xenial-server-cloudimg-amd64-vagrant.box'),
                      C: unpackPath
                    }
                );
                // Remove box
                fs.unlinkSync(path.join(boxesPath, 'xenial-server-cloudimg-amd64-vagrant.box'));
            }
            options.ovf = path.join(unpackPath, 'box.ovf');
        }

        try {
            await provider.check(options);
            await provider.provision(options.vmname, options.cpus, options.mem, options.ovf, options.attach_iso, options.verbose);
            await provider.customize(options.vmname, options.ip, options.ssh_port, options.forward_ports, options.syncs, options.verbose);
            await provider.start(options.vmname, options.verbose);
            await provider.postSetup(options.vmname, options.ip, options.ssh_port, path.join(__dirname,'config/resources/insecure_private_key'), options.add_ssh_key, options.syncs, options.verbose);
        } catch (error) {
            console.error('=> exec error:', error);
        }
    }
    
    if(options.list)
        console.log(await provider.list());

    if(options.deleteCmd)
    {
        if( !options.vmname )
        {
            console.error("Please provide --vmname <name> with --delete");
            process.exit(1);
        }        
        console.log(await provider.delete(options.vmname));
    }

    if(options.stopCmd)
    {
        if( !options.vmname )
        {
            console.error("Please provide --vmname <name> with --stop");
            process.exit(1);
        }        
        console.log(await provider.stop(options.vmname));
    }

    if(options.infoCmd){

        if( !options.vmname )
        {
            console.error("Please provide --vmname <name> with --info");
            process.exit(1);
        }
        console.log(await provider.info(options.vmname)); 
    }

    if(options.start)
        await provider.start(options.vmname, options.verbose);
};

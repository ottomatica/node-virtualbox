/**
 * @module virtualbox
 */

const path          = require('path');
const fs            = require('fs');

const download      = require('download');
const tar           = require('tar');
const md5File       = require('md5-file/promise')
const ProgressBar = require('progress');

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
            options.quickBoot = options.quickBoot || false;
            await provider.micro(options.vmname, options.cpus, options.mem, options.attach_iso, options.ssh_port, path.join(__dirname,'config/resources/baker_rsa'), options.syncs, options.disk, options.verbose, options.quickBoot);
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
                console.log("no --ovf specified, downloading latest ubuntu box!");
                const bar = new ProgressBar('[:bar] :percent :etas', {
                    complete: '=',
                    incomplete: ' ',
                    width: 20,
                    total: 0
                });

                await download('http://cloud-images.ubuntu.com/xenial/current/xenial-server-cloudimg-amd64-vagrant.box', boxesPath)
                      .on('response', res => {
                        // console.log(`Size: ${res.headers['content-length']}`);
                        bar.total = res.headers['content-length'];
                        res.on('data', data => bar.tick(data.length));
                      })
                      .then(() => console.log('downloaded!'));
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

    if(options.exposePort )
    {
        if( !options.vmname )
        {
            console.error("Please provide --vmname <name> with --exposePort");
            process.exit(1);
        }

        console.log(await provider.expose(options.vmname, options.exposePort, options.verbose));
    }
};

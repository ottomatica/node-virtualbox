#!/usr/bin/env node

/**
 * Run virtualbox as program.
 *
 * @module virtualbox/bin
 */

// Modules
const yargs     = require('yargs');
const _         = require('lodash');
const virtualbox = require('./index');

// Dockerize
(async () => {

    try {

        // Get args and validate
        let argv = yargs.boolean('dry-run').boolean('verbose').argv;
        let args = argv._;
        if (args.length > 1) {
            throw new Error('Usage: virtualbox [--vmname=] [--verbose] ...');
        }

        // common options
        let vmname = argv.vmname;
        let verbose = argv.verbose;

        // general commands
        let list = argv.list;
        let start = argv.start;
        let check = argv.check;
        let deleteCmd = argv.delete;
        let stopCmd   = argv.stop;
        let infoCmd   = argv.info;

        // provision related arguments
        let provision = argv.provision;
        let ovf = argv.ovf;
        let attach_iso = argv.attach_iso;
        let micro = argv.micro;
        let disk = argv.disk;
        let ip = argv.ip;
        let ssh_port = argv.ssh_port;
        let forward_ports = argv.forward_ports;
        let cpus = argv.cpus;
        let mem  = argv.mem;
        let add_ssh_key = argv.add_ssh_key;
        let syncs = [];
        if( argv.sync)
        {
            syncs = _.isArray(argv.sync) ? argv.sync : [ argv.sync ];
        }

        // Update running vm arguments
        let exposePort = argv.exposePort;

        // If a dry run, enable logging
        if (argv.dryRun) {
        }

        // Provision 
        await virtualbox(
            {
                vmname, ovf, verbose, list, start, check, provision, ip, ssh_port, deleteCmd, stopCmd, infoCmd, syncs, attach_iso, micro,
                mem, cpus, add_ssh_key, forward_ports, disk, exposePort
            }
        );

    }
    catch(e) {
        console.log(e);
        process.exit(1);
    }

})();
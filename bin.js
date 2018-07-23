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
            throw new Error('Usage: virtualbox [--vmname=] [--verbose] [--dry-run]');
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
        let ip = argv.ip;
        let port = argv.port;
        let syncs = [];
        if( argv.sync)
        {
            syncs = _.isArray(argv.sync) ? argv.sync : [ argv.sync ];
        }

        // If a dry run, enable logging
        if (argv.dryRun) {
        }

        // Provision
        await virtualbox(
            {
                vmname, ovf, verbose, list, start, check, provision, ip, port, deleteCmd, stopCmd, infoCmd, syncs, attach_iso
            }
        );

    }
    catch(e) {
        console.log(e);
        process.exit(1);
    }

})();
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
            throw new Error('Usage: virtualbox [--vmname=] [--ovf=] [--verbose] [--dry-run]');
        }

        // Get language, package name, and version
        let vmname = argv.vmname;
        let ovf = argv.ovf;
        let verbose = argv.verbose;
        let list = argv.list;
        let start = argv.start;
        let check = argv.check;
        let provision = argv.provision;

        // If a dry run, enable logging
        if (argv.dryRun) {
        }

        // Get command
        // let cmd;
        // if (argv.cmd) {
        //     cmd = _.omitBy({
        //         command: argv.cmd,
        //         args: _.isArray(argv.arg) ? argv.arg : [ argv.arg ]
        //     }, _.isUndefined);
        // }

        // Provision
        await virtualbox(
            {
                vmname, ovf, verbose, list, start, check, provision
            }
        );

    }
    catch(e) {
        console.log(e);
        process.exit(1);
    }

})();
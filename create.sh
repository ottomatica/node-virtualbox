#!/bin/bash

# terminate early if commands fail
set -e 
#set -o pipefail

VM="demo-ubuntu"
BOX=~/.vagrant.d/boxes/ubuntu-VAGRANTSLASH-xenial64/20180620.0.0/virtualbox/box.ovf

IPGATEWAY=192.168.33.1
SSH_PORT=2002

VBoxManage import $BOX --vsys 0 --vmname ${VM} || echo "alredy created"

# Prevent hanging in boot waiting for console
VBoxManage modifyvm ${VM} --uart1 0x3f8 4 --uartmode1 disconnected

# Networking
VBOXNET=vboxnet0

# turn off for now...
# VBoxManage hostonlyif create
# VBoxManage hostonlyif ipconfig ${VBOXNET} --ip ${IPGATEWAY}

# TODO: Something smart with this
# VBoxManage list hostonlyifs

# Name:            vboxnet7
# GUID:            786f6276-656e-4774-8000-0a0027000007
# DHCP:            Disabled
# IPAddress:       192.168.63.1
# NetworkMask:     255.255.255.0
# IPV6Address:     
# IPV6NetworkMaskPrefixLength: 0
# HardwareAddress: 0a:00:27:00:00:07
# MediumType:      Ethernet
# Wireless:        No
# Status:          Down
# VBoxNetworkName: HostInterfaceNetworking-vboxnet7

# NIC 1 (NAT)
VBoxManage modifyvm ${VM} --nic1 nat
VBoxManage modifyvm ${VM} --nictype1 virtio
# Use port forwarding to enable ssh.
#VBoxManage modifyvm ${VM} --natpf1 delete "guestssh" || echo "not here"
VBoxManage modifyvm ${VM} --natpf1 "guestssh,tcp,,${SSH_PORT},,22"

# NIC 2 (HOST-ONLY IP)
VBoxManage modifyvm ${VM} --hostonlyadapter2 ${VBOXNET}
VBoxManage modifyvm ${VM} --nic2 hostonly
VBoxManage modifyvm ${VM} --nictype2 virtio

VBoxManage startvm ${VM} --type headless
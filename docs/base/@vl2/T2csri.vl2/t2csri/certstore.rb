#
# Tribes 2 Community System Reengineering Initiative
# Client Side Credential/Certificate Store
# Version 1.1 (2009/01/25)
#
# Written by Electricutioner/Thyth
# http://absolous.no-ip.com/
# Copyright 2008 - 2009
#
# Released under the terms of the GNU General Public License v3 or later.
# http://www.gnu.org/licenses/gpl.html
# Your use of this software is subject to the terms of that license. Use, modification, or distribution
# constitutes acceptance of these software terms. This license is the only manner by which you are permitted
# to use this software, thus rejection of the license terms prohibits your use of this software.
#
$accCerts = Hash.new
$accPrivateKeys = Hash.new

def certstore_loadAccounts
	IO.foreach('public.store') {|line| $accCerts[line.split("\t")[0].downcase] = line.rstrip.lstrip }
	IO.foreach('private.store') {|line| $accPrivateKeys[line.split("\t")[0].downcase] = line.rstrip.lstrip }
end

def certstore_addAccount(public, private)
	$accCerts[public.split("\t")[0].downcase] = public
	$accPrivateKeys[public.split("\t")[0].downcase] = private

	publicstore = File.new('public.store', 'a')
	publicstore.seek(0, IO::SEEK_END)
	publicstore.puts(public + "\r\n")
	publicstore.close

	privatestore = File.new('private.store', 'a')
	privatestore.seek(0, IO::SEEK_END)
	privatestore.puts(private + "\r\n")
	privatestore.close
end

def certstore_listAccounts
	list = String.new
	$accCerts.each_key { |username| list = list.rstrip + "\t" + $accCerts[username].split("\t")[0].to_s }
	return list.lstrip
end

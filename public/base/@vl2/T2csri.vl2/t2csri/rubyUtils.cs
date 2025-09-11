// Tribes 2 Unofficial Authentication System
// http://www.tribesnext.com/
// Written by Electricutioner/Thyth
// Copyright 2008-2009 by Electricutioner/Thyth and the Tribes 2 Community System Reengineering Intitiative

// Ruby Interface Utilities Version 1.3 (01/27/2009)

// loads a ruby script
function rubyExec(%script)
{
	echo("Loading Ruby script " @ %script @ ".");
	new FileObject("RubyExecutor");
	RubyExecutor.openForRead(%script);

	while (!RubyExecutor.isEOF())
	{
		%line = RubyExecutor.readLine();
		%buffer = %buffer @ "\n" @ %line;
	}
	rubyEval(%buffer);
	RubyExecutor.close();
	RubyExecutor.delete();
}

// extracts a value from the Ruby interpreter environment
function rubyGetValue(%value)
{
	$temp = "";
	rubyEval("tsEval '$temp=\"' + " @ %value @ " + '\";'");
	return $temp;
}

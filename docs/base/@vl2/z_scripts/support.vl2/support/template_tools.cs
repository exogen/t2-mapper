// #name = Template Tools
// #version = 0.0.1
// #date = May 16, 2001
// #status = beta
// #description = Provides tools for script Authors to define and use code templates
// #category = Support
// #author = Jon Naiman
// #warrior = Ratorasniki
// #email = ratorasniki@tribalwar.com
// #web = http://www.tribalwar.com
//************************************************************************************ 
$TemplateLoadBasic = 1; // Do not load file contents into object
				// only set to 0 when debugging templates
				// otherwise it just wastes memory
$TemplateClearFile = 1;
//************************************************************************************
// Template addition & class stuff (ie. 'the guts')
function useTemplate(%name, %replacement, %tmp)
{
 if($tempflock == 0) //keep the temp file from being used twice
 {
   if(%tmp != 1)
	%tmp = 0;
   $tempflock = 1;
   %TemplateToUse = -1;
   %TemplateLines = 0;
   for( %i = 0; %i < Templates.getCount(); %i++ )
   {
	if(Templates.getObject(%i).name $= %name)
	{
	   %TemplateToUse = Templates.getObject(%i);
	}
   }
   if(%TemplateToUse != -1)
   {
	if($TemplateLoadBasic == 1)
	{
	   %TemplateFilename = %TemplateToUse.filename; 	// get the filename
	   %TemplateToUse.delete();					// delete the old object
	   %TemplateToUse = addTemplate(%TemplateFilename);	// recreate w/ contents
	}
	%TemplateLines = %TemplateToUse.linenum;
	%TemplateContents = "";
	%Filehandle = new FileObject();
	if(%tmp == 0)
	{
	   %Filehandle.openForWrite( "support/templates/temp.cs" );
	} else {
	   %Filehandle.openForAppend( "support/templates/temp.cs" );
	   %Filehandle.writeLine( "" );
	   %Filehandle.writeLine( "//-----Starting Template " @ %TemplateToUse.name @ " using " @ %replacement @ "-----" );
	   %Filehandle.writeLine( "" );
	}
	for(%i = 1; %i < %TemplateLines; %i++)
	{
	   %oldstr = %TemplateToUse.line[%i];
	   %newstr = ReplaceTextInString(%oldstr, "< " @ %TemplateToUse.name @ " >", %replacement);
	   while ( %oldstr !$= %newstr )
	   {
		%oldstr = %newstr;
		%newstr = ReplaceTextInString(%oldstr, "< " @ %TemplateToUse.name @ " >", %replacement);		
	   }
	   %Filehandle.writeLine( %newstr );
	}
	%Filehandle.close();
	%Filehandle.delete();
	// load the new stuff into t2
	if(%tmp != 1)
	{
	   compile("support/templates/temp.cs"); // force recompile it
	   exec("support/templates/temp.cs");
	}
	// clear the file
	if($TemplateClearFile == 1 && %tmp != 1)
	{
	   %Filehandle2 = new FileObject();
	   %Filehandle2.openForWrite( "support/templates/temp.cs" );
	   %Filehandle2.close();
	   %Filehandle2.delete();
	}
	if($TemplateLoadBasic == 1)
	{
	   %TemplateFilename = %TemplateToUse.filename; 		// get the filename
	   %TemplateToUse.delete();						// delete the new object
	   %TemplateToUse = addTemplateBasic(%TemplateFilename);	// recreate w/o contents
	}
   }
   $tempflock = 0;
   return 1;
 } else {
   return 0;
 }
}

function ReplaceTextInString(%string, %search_text, %replacement)
{
   if((%pos = strstr(%string, %search_text)) != -1)
   {
	%len = strlen(%search_text);
      %newstr = getSubStr(%string, 0, %pos) @ %replacement @ getSubStr(%string, %pos + %len, 10000);
	return %newstr;
   } else {
	return %string;
   }
}

function addTemplate(%filename, %isfile)
{
    if( !( fileExt(%filename) $= ".tmp" ) )
    {
        echo("addTemplate(" @ %filename @ ") failed -- " @ %filename @ " does not have a .tmp extension");
        return false;
    }

    if(%isfile && !isfile(%filename))
    {
        echo("addTemplate(" @ %filename @ ") failed -- " @ %filename @ " does not exist");
        return false;
    }

    %Filehandle = new FileObject();
    %Filehandle.openForRead( %filename );
    %linenum = 0;
    while ( !%Filehandle.isEOF() )
    {
       %line = %Filehandle.readLine();
       if ( %linenum > 0 )
       {
          //file contents
	    %TemplateLine[%linenum] = %line;
	    %linenum++;
       } else {
	    //file header
	    %TemplateName = %line;
	    %linenum++;
	 }
    }
    %Filehandle.close();
    %Filehandle.delete();

    %TemplateName = getSubStr(%TemplateName, strlen("// template< "), strlen(%TemplateName) - strlen("// template< ") - 2);

    $template[%TemplateName] = new ScriptObject()
    {
	  name = %TemplateName;
        class = template;
        filename = %filename;
    };
    Templates.add($template[%TemplateName]);
    for(%i = 1; %i < %linenum; %i++) //start at first line after header
	$template[%TemplateName].line[%i] = %TemplateLine[%i];
    $template[%TemplateName].linenum = %linenum;
    return $template[%TemplateName];
}

function addTemplateBasic(%filename, %isfile)
{
    if( !( fileExt(%filename) $= ".tmp" ) )
    {
        echo("addTemplate(" @ %filename @ ") failed -- " @ %filename @ " does not have a .tmp extension");
        return false;
    }

    if(%isfile && !isfile(%filename))
    {
        echo("addTemplate(" @ %filename @ ") failed -- " @ %filename @ " does not exist");
        return false;
    }

    %Filehandle = new FileObject();
    %Filehandle.openForRead( %filename );
    %linenum = 0;
    while ( !%Filehandle.isEOF() )
    {
       %line = %Filehandle.readLine();
       if ( %linenum > 0 )
       {
          //file contents
	    %linenum++;
       } else {
	    //file header
	    %TemplateName = %line;
	    %linenum++;
	 }
    }
    %Filehandle.close();
    %Filehandle.delete();

    %TemplateName = getSubStr(%TemplateName, strlen("// template< "), strlen(%TemplateName) - strlen("// template< ") - 2);

    $template[%TemplateName] = new ScriptObject()
    {
	  name = %TemplateName;
        class = template;
        filename = %filename;
    };
    Templates.add($template[%TemplateName]);
    $template[%TemplateName].linenum = %linenum;
    return $template[%TemplateName];
}

//---------------------------
// this ones special, usage:
// $ExampleReplacement = "Testing"; $ExampleValue = 1;
// addDynamicString("$Var::< Example > = " @ $ExampleValue, "Example", $ExampleReplacement);
// creates:
// $Var::Testing = 1;
function addDynamicString(%string, %var, %replacement)
{
    %oldstr = %string;
    %newstr = ReplaceTextInString(%oldstr, "< " @ %var @ " >", %replacement);
    while ( %oldstr !$= %newstr )
    { 
	%oldstr = %newstr;
	%newstr = ReplaceTextInString(%oldstr, "< " @ %var @ " >", %replacement);		
    }
//    echo(%newstr);
    return %newstr;
}

function template::main(%this)
{
    if(!isObject(%this.loadedGroup))
        %this.loadedGroup = new SimGroup(Templates);
    echo(" - - - - - - Searching for templates to load...");

    for(%filename = findFirstFile("*.tmp"); %filename !$= ""; %filename = findNextFile("*.tmp"))
    {
        if(!isObject($template[%filename]))
        {
            echo(" + '" @ %filename @ "' found");
            %this.processFile(%filename);
        }
    }
    echo(" - - - - - - template load done!");
    %this.numinit = 0;
    $TemplateLoader = schedule(3000, 0, "GenTemplates");
}

function template::processFile(%this, %filename)
{
    if(isObject($template[%filename]))
    {
        return 0;
    }
    if($TemplateLoadBasic == 1)
    {
        if(!addTemplateBasic(%filename))
        {
            return -1;
        }
    } else {
        if(!addTemplate(%filename))
        {
            return -1;
        }
    }
    return 1;
}

function template::Use(%this, %name, %var)
{
   cancel($TemplateLoader);
   %this.initName[%this.numinit] = %name;
   %this.initVar[%this.numinit] = %var;
   %this.numinit = %this.numinit + 1;
   $TemplateLoader = schedule(3000, 0, "GenTemplates");
   return %this.numinit;
}

function GenTemplates()
{
   %num = template.Generate();
   echo( %num @ " bits o code generated from templates" );
}

function template::Generate(%this)
{
   //do all the preloaded ones in one batch :D

   %Filehandle = new FileObject();
   %Filehandle.openForWrite( "support/templates/temp.cs" );
   %Filehandle.close();
   %Filehandle.delete();

   for( %i = 0; %i < %this.numinit; %i++ )
   {
	%load[%i] = useTemplate(%this.initName[%i], %this.initVar[%i], 1);
	while(%load[%i] != 1)
	{
	   %load[%i] = useTemplate(%this.initName[%i], %this.initVar[%i], 1);
	}
   }

   compile("support/templates/temp.cs"); // force recompile it
   exec("support/templates/temp.cs");
   return %this.numinit;
}

function TemplateStart()
{
    if( !isObject(template) )
    {
        new ScriptObject(template)
        {
            class = template;
        };
        template.main();
    }
}

TemplateStart();


// #name = File Tools
// #version = 1.2.0
// #date = May 19, 2001
// #category = Support
// #author = Lorne Laliberte
// #warrior = Writer
// #email = t2beta@cdnwriter.com
// #web = http://www.t2scripts.com
// #web = http://www.cdnwriter.com
// #description = Adds new member functions to the FileObject class
// #credit = Kaiten Commander for CopyTextFile() (Added by UberGuy 01/26/03)
// #status = release
// #include = support/string_tools.cs
// ---------------------------------------------------------------------------

// need to add some usage docs here :)

// get length of filename in bytes
function FileObject::getLen(%this, %filename)
{
    if(!%this.openForRead(%filename))
        return 0;

    %length = 0;
    while(true)
    {
        if( $platform $= "linux" ) // thanks to ratorasniki for this test :)
        {
            %length += strlen( %line = %this.readline() );
        }
        else
        {
            %length += strlen( %line = %this.readline() ) + 2; // allow for CRLF on Windows
        }

        if(%this.isEOF())
            break;
    }

    return %length;
}

// append a line (%text) to the end of %filename
function FileObject::appendLine(%this, %filename, %text)
{
    // open/re-open the file to move to the start of it
    if(!%this.openForRead(%filename))
        return false;

    // read file into temporary storage
    for(%i = 1; !%this.isEOF(); %i++)
        %temp[%i] = %this.readLine();

    // make sure we can write to the file
    if(!%this.openForWrite(%filename))
        return false;

    %lines = %i;

    // write the lines back into the file
    for(%i = 1; %i < %lines; %i++)
        %this.writeLine(%temp[%i]);

    // append the line
    %this.writeLine(%text);

    return true;
}

// insert line (%text) into %filename at %line_number
function FileObject::insertLine(%this, %filename, %text, %line_number)
{
    // open/re-open the file to move to the start of it
    if(!%this.openForRead(%filename))
        return false;

    // read file into temporary storage
    for(%i = 1; !%this.isEOF(); %i++)
        %temp[%i] = %this.readLine();

    // make sure we can write to the file
    if(!%this.openForWrite(%filename))
        return false;

    %lines = %i;

    if(!%line_number)
        %line_number = 1;

    // write the lines back into the file, up to %line_number
    for(%i = 1; %i < %line_number; %i++)
        %this.writeLine(%temp[%i]);

    // insert the text
    %this.writeLine(%text);

    // leave %i the same so %text is inserted before %line_number
    for(%i = %i; %i < %lines; %i++)
        %this.writeLine(%temp[%i]);

    return true;
}

// insert line with %text in %filename at %line_number
function FileObject::replaceLine(%this, %filename, %text, %line_number)
{
    // open/re-open the file to move to the start of it
    if(!%this.openForRead(%filename))
        return false;

    // read file into temporary storage
    for(%i = 1; !%this.isEOF(); %i++)
        %temp[%i] = %this.readLine();

    // make sure we can write to the file
    if(!%this.openForWrite(%filename))
        return false;

    %lines = %i;

    if(!%line_number)
        %line_number = 1;

    // write the lines back into the file, up to %line_number
    for(%i = 1; %i < %line_number; %i++)
        %this.writeLine(%temp[%i]);

    // insert the text
    %this.writeLine(%text);

    // increment %i so %text replaces %line_number
    for(%i++; %i < %lines; %i++)
        %this.writeLine(%temp[%i]);

    return true;
}


// return line number of first occurence of %text in %filename,
// optionally starting from %start_at and ending at %end_at
function FileObject::findInFile(%this, %filename, %text, %start_at, %end_at)
{
    // open/re-open the file to move to the start of it
    if(!%this.openForRead(%filename))
        return 0;

    if(%end_at && (%end_at < %start_at))
        %end_at = %start_at;

    // look for %text in %filename
    for(%i = 1; !%this.isEOF(); %i++)
    {
        if(%start_at && (%i < %start_at))
            continue;

        if( (strstr(%this.readLine(), %text) != -1) || (%end_at && (%i == %end_at)) )
            return %i;
    }

    return 0;
}

// replace every occurence of %search_text in %filename with %replace_text
// optionally starting from %start_at and ending at %end_at
// returns number of replacements made, or -1 on error
function FileObject::replaceInFile(%this, %filename, %search_text, %replace_text, %start_at, %end_at)
{
    // open/re-open the file to move to the start of it
    if(!%this.openForRead(%filename))
        return -1;

    %replace_count = 0;

    %len = strlen(%search_text);

    if(%end_at && (%end_at < %start_at))
        %end_at = %start_at;

    // read file into temporary storage
    for(%i = 1; !%this.isEOF(); %i++)
    {
        %temp[%i] = %this.readLine();

        // starting from %start_at...and ending at %end_at...
        if((%i >= %start_at) && (%i <= %end_at))
        {
            // replace %search_text with %replace_text, if found
            if((%pos = strstr(%temp[%i], %search_text)) != -1)
            {
                %newstr = getSubStr(%temp[%i], 0, %pos) @ %replace_text @ getSubStr(%temp[%i], %pos + %len, 10000);
                %temp[%i] = %newstr;
                %replace_count++;
            }
        }
    }

    // make sure we can write to the file
    if(!%this.openForWrite(%filename))
        return -1;

    %lines = %i;

    // write the (modified) lines back into the file
    for(%i = 1; %i < %lines; %i++)
        %this.writeLine(%temp[%i]);

    return %replace_count;
}


// replace every line in %filename that has %search_text in it with %replace_text,
// optionally starting from %start_at and ending at %end_at
// returns number of replacements made, or -1 on error
function FileObject::replaceLinesInFile(%this, %filename, %search_text, %replace_text, %start_at, %end_at)
{
    // open/re-open the file to move to the start of it
    if(!%this.openForRead(%filename))
        return -1;

    %replace_count = 0;

    %len = strlen(%search_text);

    if(%start_at $= "")
        %start_at = 1;

    // read file into temporary storage
    for(%i = 1; !%this.isEOF(); %i++)
    {
        %temp[%i] = %this.readLine();

        // starting from %start_at...and ending at %end_at...
        if((%i >= %start_at) && ((%end_at $= "") || (%i <= %end_at)))
        {
            // replace %search_text with %replace_text, if found
            if( (strstr(%temp[%i], %search_text) ) != -1)
            {
                %temp[%i] = %replace_text;
                %replace_count++;
            }
        }
    }

    // make sure we can write to the file
    if(!%this.openForWrite(%filename))
        return -1;

    %lines = %i;

    // write the (modified) lines back into the file
    for(%i = 1; %i < %lines; %i++)
        %this.writeLine(%temp[%i]);

    return %replace_count;
}

// remove every line in %filename that has %search_text in it,
// optionally starting from %start_at and ending at %end_at
// returns number of replacements made, or -1 on error
function FileObject::removeLinesFromFile(%this, %filename, %search_text, %start_at, %end_at)
{
    // open/re-open the file to move to the start of it
    if(!%this.openForRead(%filename))
        return -1;

    %remove_count = 0;

    %len = strlen(%search_text);

    if(%start_at $= "")
        %start_at = 1;

    // read file into temporary storage
    for(%i = 1; !%this.isEOF(); %i++)
    {
        %temp[%i] = %this.readLine();
    }

    // make sure we can write to the file
    if(!%this.openForWrite(%filename))
        return -1;

    %lines = %i;

    // write the lines back into the file
    for(%i = 1; %i < %lines; %i++)
    {
        // starting from %start_at...and ending at %end_at...
        if((%i >= %start_at) && ((%end_at $= "") || (%i <= %end_at)))
        {
            // replace %search_text with %replace_text, if found
            if( ( strstr(%temp[%i], %search_text) ) != -1)
            {
                // remove the line
                %remove_count++;
            }
            else
            {
                // write the line
                %this.writeLine(%temp[%i]);
            }
        }
    }

    return %remove_count;
}



// get contents of %filename as a string,
// optionally starting from %start_at and ending at %end_at
function FileObject::getContents(%this, %filename, %start_at, %end_at)
{
    // open/re-open the file to move to the start of it
    if(!%this.openForRead(%filename))
        return "";

    if(%start_at $= "")
        %start_at = 1;

    // read file into temporary storage
    for(%i = 1; !%this.isEOF(); %i++)
    {

        // starting from %start_at...
        if(%i >= %start_at)
            %string = %string @ %this.readLine() @ "\n";
        else
            %this.readline();

        // ...and ending at %end_at
        if(%end_at && (%i >= %end_at))
            return %string;
    }

    return %string;
}

// append the contents of %text to %filename
// returns true on success, false on failure
function FileObject::append(%this, %filename, %text)
{
    %i = 1; // init here in case file doesn't exist
    if(isFile(%filename))
    {
        // open/re-open the file to move to the start of it
        if(!%this.openForRead(%filename))
            return false;

        // read file into temporary storage
        for(%i = 1; !%this.isEOF(); %i++)
            %temp[%i] = %this.readLine();
    }

    // make sure we can write to the file
    if(!%this.openForWrite(%filename))
        return false;

    %str = %text;

    // add the new content
    while( (%endline_pos = strstr(%str, "\n")) != -1 )
    {
        %temp[%i] = getSubStr(%str, 0, %endline_pos);
        %str = getSubStr(%str, %endline_pos + 1, 1000000);
        %i++;
    }

    // add the last line
    if(%str !$= "")
    {
        %temp[%i] = %str;
        %i++;
    }

    %lines = %i;

    // write the lines back into the file
    for(%i = 1; %i < %lines; %i++)
        %this.writeLine(%temp[%i]);

    return true;
}


// write the contents of %text to %filename
// returns true on success, false on failure
function FileObject::write(%this, %filename, %text)
{
    // make sure we can write to the file
    if(!%this.openForWrite(%filename))
        return false;

    %str = %text;

    // set up the new content
    %i = 1;
    while( (%endline_pos = strstr(%str, "\n")) != -1 )
    {
        %temp[%i] = getSubStr(%str, 0, %endline_pos);
        %str = getSubStr(%str, %endline_pos + 1, 1000000);
        %i++;
    }

    // add the last line
    if(%str !$= "")
    {
        %temp[%i] = %str;
        %i++;
    }

    %lines = %i;

    // write the lines back into the file
    for(%i = 1; %i < %lines; %i++)
        %this.writeLine(%temp[%i]);

    return true;
}

// #name = CopyTextFile
// #version = 1.0
// #date = 21 January 2003
// #status = Working
// #author = @-Kaiten Commander
// #warrior = Kaiten Commander
// #email = kaiten@cb-tribes.co.uk
// #web = http://www.kaiten.barrysworld.net

// Used ingame to copy files. I don't know why people would want to copy files..
// Maybe can be used to backup prefs, cs files etc.
// This is resticted to plain text files (cs, txt, etc).
// This cannot be used to copy recordings, Screenshots,vl2 or dso files.
//
// Usage: CopyTextFile("PathTo/SourceFile", "PathTo/DestinationFile");
// "PathTo" is relative to Base or mod directory.
// Example: CopyTextFile("scripts/autoexec/copy.cs", "scripts/autoexec/copy.txt"); <--- Copies file if not existing
// Example: CopyTextFile("scripts/autoexec/copy.cs", "scripts/autoexec/copy.txt", 1);  <--- Overwrites file if existing
//
// Errors:
// "Error: Filenames may not contain any of the following characters: \\ ? * < > \' |" <-- Illegal Chars.
// "Error: Source & Destination cannot be the same!" <---- Duh.
// "Error: You cannot use blank filenames!" <---- Duh.
// "Error: There is no file scripts/autoexec/copy.cs".  <---- Source file doesn't exist.
// "Error: scripts/autoexec/copy.txt allready exists. Please use a different filename." <---- File allready exists.

function CopyTextFile(%sourceFile, %destFile, %overwrite)
{
   	if ( strcspn( %destFile, "\\?*\'<>|" ) < strlen( %destFile ) )
   	{
      		error("Error: Filenames may not contain any of the following characters: \\ ? * < > \' |");
            	return;
   	}

	if(%sourceFile $= %destFile)
      	{
      		error("Error: Source & Destination cannot be the same!");
      		return;
	}

	if(%sourceFile $= "" || %destFile $= "")
	{
		error("Error: You cannot use blank filenames!");
      		return;
      	}

      	if(!isFile(%sourceFile))
      	{
		error("Error: There is no file "@%sourceFile);
      		return;
      	}

      	if(isFile(%destFile))
      	{
		if(!%overwrite)
		{
			error("Error: "@%destFile@" allready exists. Please use a different filename.");
      			return;
      		}
      		else
      		{
      			deleteFile(%destFile);
      			warn(%destFile@" Deleted.");
      		}

      	}

	%sObject = new FileObject();
	%dObject = new FileObject();

	%sObject.openForRead(%sourceFile);
	// open/re-open the file to move to the start of it
	if(!%sObject.openForRead(%sourceFile))
	{
		error("Error: Unable to open: "@%sourceFile);
		return;
	}

	// read file into temporary storage
	for(%i = 1; !%sObject.isEOF(); %i++)
		%temp[%i] = %sObject.readLine();

	%dObject.openForWrite(%destFile);
	// make sure we can write to the file
	if(!%dObject.openForWrite(%destFile))
	{
		error("Error: Unable to write: "@%destFile);
        	return;
    	}

	%lines = %i;

	// write the lines back into the file
	for(%i = 1; %i < %lines; %i++)
		%dObject.writeLine(%temp[%i]);

	%sObject.close();
	%dObject.close();
	warn("Copied file: "@%sourceFile@" to: "@%destFile);
}
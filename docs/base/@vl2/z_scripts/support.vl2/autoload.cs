// #name = Autoload (Script Manager / Preprocessor)
// #version = 2.2.3
// #date = September 20, 2001
// #status = beta
// #description = Automatically loads scripts and preprocesses header directives
// #category = Support
// #author = Lorne Laliberte
// #warrior = Writer
// #email = t2beta@cdnwriter.com
// #email = writer@planetstarsiege.com - this is my old address but I still receive email there
// #web = http://www.t2scripts.com
// #web = http://www.cdnwriter.com
// #include = support/callback.cs
// #include = support/file_tools.cs
// #include = support/launch_menu.cs
// #include = support/object_tools.cs
// #include = support/string_tools.cs
// #readme = readme_first.txt
// #config = AutoloadOptionsGui
// ---------------------------------------------------------------------------

// Defaults:
$AutoloadEnabled = true;
$AutoloadIni = "prefs/autoload.ini";
$AutoloadLog = "prefs/autoload.log";

// set a flag to prevent autoexec.cs or autoload_loader.cs from running again
$AutoloadExecuted = true;

package LoadLater
{

//// add <a:callback\t...> tag
//function GuiMLTextCtrl::onURL(%this, %url)
//{
//    switch$( getField(%url, 0) )
//    {
//        case "callback":
//
//            %cb = getField(%url, 1);
//
//            if(%cb $= "")
//                return;
//
//            %i = 0;
//            while((%p[%i] = getField(%url, %i + 2)) !$= "")
//                %i++;
//
//            callback.trigger(%cb, %p0, %p1, %p2, %p3, %p4);
//
//        default:
//
//            Parent::onURL(%this, %url);
//    }
//    return;
//}


function DispatchLaunchMode()
{
    // check T2 command line arguments
    for(%i = 1; %i < $Game::argc ; %i++)
    {
        %arg = $Game::argv[%i];
        %nextArg = $Game::argv[%i+1];
        %hasNextArg = $Game::argc - %i > 1;

        if( !stricmp(%arg, "-noautoload") ) // $=
        {
            $AutoloadEnabled = false;
        }
        else if( !stricmp(%arg, "-autoloadini") && %hasNextArg )
        {
            %i++;
            $AutoloadIni = %nextArg;
        }
        else if( !stricmp(%arg, "-autoloadlog") && %hasNextArg )
        {
            %i++;
            $AutoloadLog = %nextArg;
        }
        else if( !stricmp(%arg, "-autoloadremovefailed") )
        {
            $AutoloadRemoveFailedScripts = true;
        }
        else if( !stricmp(%arg, "-skipnewautoload") )
        {
            $SkipNewAutoloadScripts = true;
        }
    }

    if($AutoloadEnabled)
    {
        // We need to call these the old-fashioned way first because the header
        // processing functions require the overloaded firstWord() from string_tools.cs :)
        // I later process the above header and the includes with the "nocalls"
        // flag set, so a script object will get built for each of these files.

        exec("support/string_tools.cs");
        exec("support/object_tools.cs");
        exec("support/file_tools.cs");
        exec("support/callback.cs"); // required by launch_menu.cs
        exec("support/launch_menu.cs");
//        exec("support/update_tools.cs");

        //$SCRIPT_STATUS_NOT_SET          = 0;
        $SCRIPT_PROCESSED               = 1; // script was processed but not executed
        $SCRIPT_EXECUTED                = 2;
        $SCRIPT_DEACTIVATED             = 3;
        $SCRIPT_DOES_NOT_EXIST          = 4;
        $SCRIPT_REQUIREMENTS_NOT_MET    = 5;
        $SCRIPT_VERSION_NOT_MET         = 6;
        $SCRIPT_SYNTAX_ERROR            = 7;
        $SCRIPT_INVALID_FILENAME        = 8; // should never get this one
        //$SCRIPT_MADE_BY_VEKTOR          = 9; // heh, just kidding :)

//        // handler for our <a:callback\tautoloadRemoveFromIni> tag
//        callback.add(autoloadRemoveFromIni, "autoload.removeFromIni");

        // add the SCRIPTS item to the launch menu :)
        callback.add(LaunchMenuReady, "SB_AddLaunchItem();");

        AutoloadStart();
    }


    parent::DispatchLaunchMode();
}

function DisconnectedCleanup()
{
	ScriptBrowserGui.launchedFrom = 0;
	parent::DisconnectedCleanup();
}

function OpenLaunchTabs()
{
	parent::OpenLaunchTabs();
	if (!ScriptBrowserGui.scriptsAdded) {
		LaunchTabView.addLaunchTab( "SCRIPTS", ScriptBrowserGui);
		ScriptBrowserGui.scriptsAdded = true;
	}
}

}; // end package "LoadLater"


// strip all ini-style comments from %text
function strip_ini_comments(%text)
{
    %comment_pos = strstr(%text, ";");

    if(%comment_pos == -1)
        return %text;

    return getSubStr(%text, 0, %comment_pos);
}


// skip first ini-style comment character(s) in %text
// returns string starting with the first non-comment/non-whitespace character
function skip_ini_comments(%text)
{
    %text = trim(%text);

    // skip all whitespace and .ini comment characters (;) at start of %text
    %first_char = getSubStr(%text, 0, 1);
    while(%first_char $= ";")
    {
        %text = trim(getSubStr(%text, 1, 10000));
        %first_char = getSubStr(%text, 0, 1);
    }

    return %text;
}


// ---------------------------------------------------------------------------
// Script Class:
//
// Each script listed in the autoload.ini file or tested via #include
// directives (or in the search for new autoloadable files) gets an object of
// this class holding all the information from that script's header.
//
// I wanted to use FileObject and make class "script" a child of FileObject,
// but T2 checks the number of args passed to member functions of FileObject
// (and its children)...so I couldn't do a .readline() with no %filename
// passed, even though I have "script" set up to contain the current filename.
//
// So I've built "script" as a ScriptObject instead, and duplicated the
// FileObject functionality as required.
//
// I've designed "script" so each object is aware of what filename it's meant
// to operate on, so you don't have to pass a filename to the openForRead()
// member, for instance.
// ---------------------------------------------------------------------------


// psuedo-constructor
function newScript(%filename, %isfile)
{
    // make sure %filename is a script that we can open for read access
    // (it must be a .cs or .gui file on its own or in a .v2l file...not a .dso file)
    if( !( (fileExt(%filename) $= ".cs") || (fileExt(%filename) $= ".gui") ) )
    {
        echo("newScript(" @ %filename @ ") failed -- " @ %filename @ " does not have a .cs or .gui extension");
        return false;
    }

    if(%isfile && !isfile(%filename))
    {
        echo("newScript(" @ %filename @ ") failed -- " @ %filename @ " does not exist");
        return false;
    }

    return $script[%filename] = new ScriptObject()
    {
        class = script;
        filename = %filename;
        currentLine = 0;
        includeCount = 0;
        authorCount = 0;
        creditCount = 0;
        emailCount = 0;
        webCount = 0;
        hide = false;
    };
}


function script::openForRead(%this)
{
    if(!isObject(%this.filehandle))
        %this.filehandle = new FileObject();

    %this.accessWrite = false;
    %this.currentLine = 0;

    // try to open it
    %this.accessRead = %this.filehandle.openForRead(%this.filename);

    if(!%this.accessRead)
        echo("script::openForRead failed -- " @ %filename @ " cannot be read");

    return %this.accessRead;
}


function script::openForWrite(%this)
{
    if(!isObject(%this.filehandle))
        %this.filehandle = new FileObject();

    %this.accessRead = false;
    %this.currentLine = 0;

    // try to open it
    %this.accessWrite = %this.filehandle.openForWrite(%this.filename);

    if(!%this.accessWrite)
        echo("script::openForWrite failed -- " @ %filename @ " cannot be written to");

    return %this.accessWrite;
}


function script::readLine(%this)
{
    if(!%this.accessRead)
    {
        // not open...try to open it
        if(%this.openForRead())
        {
            // opening for read moves us to the top of the file
            %this.currentLine = 0;
        }
        else
        {
            echo("script::readLine failed -- " @ %filename @ " is not open and cannot be opened (why not? I don't know...you figure it out)");
            return false;
        }
    }

    if(!%this.filehandle.isEOF())
        %this.currentLine++;

    return %this.filehandle.readline();
}


function script::writeLine(%this, %text)
{
    if(!%this.accessWrite)
    {
        // not open...try to open it
        if(%this.openForWrite())
        {
            // opening for Write moves us to the top of the file
            %this.currentLine = 0;
        }
        else
        {
            echo("script::writeLine failed -- " @ %filename @ " is not open and cannot be opened (why not? I don't know...you figure it out)");
            return false;
        }
    }

    %this.currentLine++;
    return %this.filehandle.writeline(%text);
}


function script::isEOF(%this)
{
    return %this.filehandle.isEOF();
}


function script::close(%this)
{
    %this.accessRead =
    %this.accessWrite = false;
    %this.currentLine = 0;

    %this.filehandle.close();
    %this.filehandle.delete();
}

function script::getLen(%this)
{
    return %this.filehandle.getLen(%this.filename);
}


function script::appendLine(%this, %text)
{
    return %this.filehandle.appendLine(%this.filename, %text);
}


function script::insertLine(%this, %text, %line_number)
{
    return %this.filehandle.insertLine(%this.filename, %text, %line_number);
}


function script::replaceLine(%this, %text, %line_number)
{
    return %this.filehandle.replaceLine(%this.filename, %text, %line_number);
}


function script::findInFile(%this, %text, %line_number)
{
    return %this.filehandle.findInFile(%this.filename, %text, %line_number);
}


function script::replaceInFile(%this, %search_text, %replace_text, %line_number)
{
    return %this.filehandle.replaceInfile(%this.filename, %text, %line_number);
}

function script::replaceLinesInFile(%this, %search_text, %replace_text, %start_at, %end_at)
{
    return %this.filehandle.replaceLinesInfile(%this.filename, %text, %start_at, %end_at);
}


// returns true if script has autoload enabled
function script::getAutoload(%this)
{
    // open/re-open file to move to the first line
    if(!%this.openForRead())
        return false;

    // skip whitespace
    while( (%line $= "") && (!%this.isEOF()) )
        %line = trim(%this.readLine());

    %this.close();

    if( !stricmp(firstWord(strchr(%line, "#")), "#autoload") )
        return true; // #autoload found

    return false;
}


// returns true if %author is listed as an author of this script
function script::isAuthoredBy(%this, %author)
{
    for(%i = 0; %i < %this.authorCount; %i++)
    {
        if(!stricmp(%this.authorCount[%i], %author))
            return true;
    }
    return false;
}


// returns true if %email is listed as an email address for this script
function script::hasEmailAddress(%this, %email)
{
    for(%i = 0; %i < %this.emailCount; %i++)
    {
        if(!stricmp(%this.emailCount[%i], %email))
            return true;
    }
    return false;
}


// returns true if %web is listed as a web address for this script
function script::hasWebAddress(%this, %web)
{
    for(%i = 0; %i < %this.webCount; %i++)
    {
        if(!stricmp(%this.webCount[%i], %web))
            return true;
    }
    return false;
}


// get the script's header and populate its object's properties with the data found therein
function script::getHeader(%this)
{
    // open/re-open file to move to the first line
    if(!%this.openForRead())
        return false;

    // skip whitespace
    while( (%line $= "") && (!%this.isEOF()) )
        %line = trim(%this.readLine());

    while( (%directive = %this.get_directive(%line)) !$= "" )
    {
        %args = %this.get_args(%line);

        switch$(%directive)
        {
            case "autoload":

                %this.autoload = true;

            case "hide":

                %this.hide = true;

            case "name":

                %this.name = %args;

            case "version":

                %this.versionString = %args;
                %this.version = getVersion(%args);
                %this.revision = getRevision(%args);
                %this.subrevision = getSubrevision(%args);

            case "date":

                %this.date = %args;
                %this.year = getYearFromString(%args);
                %this.month = getMonthFromString(%args);
                %this.day = getDayFromString(%args);

            case "author":

                %this.author = %args;

            case "credit":

                %this.credit[%this.creditCount] = %args;
                %this.creditCount++;

            // UberGuy 09/10/2002 - lots of people make this typo
            case "credits":

                %this.credit[%this.creditCount] = %args;
                %this.creditCount++;

            case "warrior":

                %this.warrior = %args;

            case "email":

                if(!%this.hasEmailAddress(%args))
                {
                    %temp = %this.email[%this.emailCount] = firstWord(%args);
                    %this.emailComment[%this.emailCount] = getSubStr( %args, strstr(%args, %temp) + strlen(%temp), 10000 );
                    %this.emailCount++;
                }

            case "web":

                if(!%this.hasWebAddress(%args))
                {
                    %this.web[%this.webCount] = %args;
                    %this.webCount++;
                }

            case "description":

                %this.description = %args;

            case "status":

                %this.statusString = %args;

            case "include":

                // check for SELF keyword
                if(!stricmp(firstWord(%args), "SELF"))
                {
                    if(!%this.requires("SELF"))
                    {
                        %this.included["SELF"] = true;
                        %this.include[%this.includeCount] = "SELF";
                        %this.includeCount++;
                    }
                }
                else
                {
                    %include_file = getFilename(%args);

                    // don't add %include_file to the include list if it was already included
                    // (or if it's blank :)
                    if((%include_file !$= "") && !%this.requires(%include_file))
                    {
                        %this.included[%include_file] = true;
                        %this.include[%this.includeCount] = %include_file;

                        // get minimum version arg if provided
                        %temp = trim(getSubStr(%args, strstr(%args, %include_file) + strlen(%include_file), 10000));
                        %this.minimum_version[%this.includeCount] = firstWord(%temp);

                        %this.includeCount++;
                    }
                }

            case "self":

                // add SELF to the include list if it wasn't already included
                if(!%this.requires("SELF"))
                {
                    %this.included["SELF"] = true;
                    %this.include[%this.includeCount] = "SELF";
                    %this.includeCount++;
                }

            case "readme":

                    %this.readme = getFilename(%args);

            case "config":

                %this.config = %args;

//            case "update":
//
//                %this.update = %args;

            case "category":

                %this.category = %args;

                if(!autoload.hasCategory(%args))
                {
                    autoload.category[autoload.categoryCount] = %args;
                    autoload.categoryCount++;
                }

            default:

                echo(" - - - - - - unknown directive: '" @ %directive @ "'");
        }

        // get next line
        %line = %this.readLine();

        // skip whitespace
        while( (%line $= "") && (!%this.isEOF()) )
            %line = trim(%this.readLine());
    }
    %this.close();
}

// returns true if script's requirements have been met
// (or haven't been determined yet)
function script::requirementsMet(%this)
{
    return (%this.status != $SCRIPT_REQUIREMENTS_NOT_MET);
}

function script::get_directive(%this, %text)
{
    return getSubStr(firstWord(strchr(%text, "#")), 1, 10000);
}

function script::get_args(%this, %text)
{
    return trim(getSubStr(strchr(%text, "="), 1, 10000));
}


function script::versionCompare(%this, %text)
{
    return versionCompare(%text, %this.versionString);
}


// ---------------------------------------------------------------------------
// autoload class:
//
// Dum dum da dum!  It preprocesses, it autoloads...it slices and dices! etc.
// ---------------------------------------------------------------------------


// returns true if a file has the autoload directive up top
function autoload::get_autoload(%this, %filename)
{
    %fh = new FileObject();
    if(!%fh.openForRead(%filename))
    {
        %fh.delete();
        return false;
    }

    // skip whitespace
    while( (%line $= "") && (!%fh.isEOF()) )
        %line = trim(%fh.readLine());

    %fh.close();
    %fh.delete();

    if( !stricmp(firstWord(strchr(%line, "#")), "#autoload") )
        return true; // #autoload found

    return false;
}


// get filename from an autoload.ini line (%text)
// rejects any filenames that don't end in .cs or .gui
function autoload::get_filename(%this, %text)
{
    %text = skip_ini_comments(%text);

    %filename = getFilename(%text);

    if(!stricmp(fileExt(%filename), ".cs"))
        return %filename;
    else if(!stricmp(fileExt(%filename), ".gui"))
        return %filename;

    return "";
}


function autoload::build_default_ini_header(%this)
{
    %i = 1;
    %this.ini_line[%i]   = "; Autoload (Script Manager / Preprocessor) initializations file";
    %this.ini_line[%i++] = ";";
    %this.ini_line[%i++] = "; Use this file to modify the load order of the scripts you have installed.";
    %this.ini_line[%i++] = ";";
    %this.ini_line[%i++] = "; You can deactivate a script (so it will not load) by placing a ';' at the";
    %this.ini_line[%i++] = "; beginning of the line that script is on.";
    %this.ini_line[%i++] = ";";
    %this.ini_line[%i++] = "; A script will also fail if:";
    %this.ini_line[%i++] = ";";
    %this.ini_line[%i++] = "; - it doesn't exist";
    %this.ini_line[%i++] = "; - its requirements aren't met";
    %this.ini_line[%i++] = "; - it generates a syntax error";
    %this.ini_line[%i++] = ";";
    %this.ini_line[%i++] = "; Note: a script's requirements are determined by the #include directives in";
    %this.ini_line[%i++] = ";       its autoload header.";
    %this.ini_line[%i++] = ";";
    %this.ini_line[%i++] = "; For information on the status of each script, please see the autoload.log";
    %this.ini_line[%i++] = "; file after running and/or exiting Tribes 2.";
    %this.ini_line[%i++] = ";";
    %this.ini_line[%i++] = "; Note: You can add a script to this list and it will be loaded even if it has";
    %this.ini_line[%i++] = ";       no #autoload directive in its header, provided all of its requirements";
    %this.ini_line[%i++] = ";       (if it has any) are met.";
    %this.ini_line[%i++] = "";
    %this.ini_line_count = %i;
}


// returns true if %filename is listed as an include in the script's header
function script::requires(%this, %filename)
{
    // might change this to a loop later if we need to trim the memory use
    return %this.included[%filename];
}


// returns true if %category is already listed as a script category
function autoload::hasCategory(%this, %category)
{
    for(%i = 0; %i < %this.categoryCount; %i++)
    {
        if(!stricmp(%this.category[%i], %category))
            return true;
    }
    return false;
}


function autoload::removeFromIni(%this, %obj)
{
    // remove all lines listing this script from the autoload.ini file
    %file = new FileObject();
    %file.removeLinesFromFile($AutoloadIni, %obj.filename);

    // reload the ini file on the Autoload options page
    AutoloadIniEdit.setValue( %file.getContents($AutoloadIni));

    %file.close();
    %file.delete();

    // remove this script's object from the failed group
    %this.failedGroup.remove(%obj);

    // update the scripts list in the script browser
    SB_Scripts.update();
    SB_Scripts.setSelectedRow(0);

    return;
}

// translate a status code into a text string
function autoload::translate(%this, %status, %verbose)
{
    if(%verbose)
    {
        switch(%status)
        {
            case $SCRIPT_PROCESSED:

                return "this script has been processed but it has not been executed yet";

            case $SCRIPT_EXECUTED:

                return "this script has been executed successfully";

            case $SCRIPT_DEACTIVATED:

                return "this script was not executed because it has been deactivated in the " @ $AutoloadIni @ " file";

            case $SCRIPT_DOES_NOT_EXIST:

                return "this script was not executed because it does not exist";

            case $SCRIPT_REQUIREMENTS_NOT_MET:

                return "this script was not executed because its requirements were not met";

            case $SCRIPT_VERSION_NOT_MET:

                return "this script was not executed because a script it requires is not recent enough";

            case $SCRIPT_SYNTAX_ERROR:

                return "this script was not executed successfully, it generated a syntax error";

            case $SCRIPT_INVALID_FILENAME:

                return "this script could not be executed because the filename is invalid";
        }
    }
    else
    {
        switch(%status)
        {
            case $SCRIPT_PROCESSED:

                return "OK";

            case $SCRIPT_EXECUTED:

                return "OK";

            case $SCRIPT_DEACTIVATED:

                return "DEACTIVATED";

            case $SCRIPT_DOES_NOT_EXIST:

                return "DOES NOT EXIST";

            case $SCRIPT_REQUIREMENTS_NOT_MET:

                return "REQUIREMENTS NOT MET";

            case $SCRIPT_VERSION_NOT_MET:

                return "VERSION NOT MET";

            case $SCRIPT_SYNTAX_ERROR:

                return "SYNTAX ERROR";

            case $SCRIPT_INVALID_FILENAME:

                return "INVALID FILENAME";
        }
    }
}

function autoload::processFile(%this, %filename, %minimum_version, %from_ini, %nocalls)
{
    // does object exist?
    if(isObject($script[%filename]))
    {
        // if this call came from the autoload.ini...
        if(%from_ini)
        {
            // ...and the script has already been proven executible...
            if($script[%filename].status == $SCRIPT_EXECUTED)
            {
                // ...execute it again
                exec(%filename);

                %this.logReexecuted(%filename);

                return $SCRIPT_EXECUTED;
            }
        }

        if($script[%filename].status == $SCRIPT_VERSION_NOT_MET)
        {
            // allow scripts that failed because of _VERSION_NOT_MET
            // to be re-processed if included again (or listed in the .ini)
            $script[%filename].delete();
        }
        else
        {
            // return _VERSION_NOT_MET if the script was executed but it doesn't meet the requested minimum version
            if( ($script[%filename].status == $SCRIPT_EXECUTED) && (%minimum_version !$= "") && ($script[%filename].versionCompare(%minimum_version) == -1) )
                return $SCRIPT_VERSION_NOT_MET;

            // otherwise, the script has already failed or loaded once, so just return its current status
            return $script[%filename].status;
        }
    }

    // create new object
    if(!newScript(%filename))
    {
        %this.logInvalidFilename(%filename);
        return $SCRIPT_INVALID_FILENAME;
    }

    // is script deactivated?
    if(%this.is_deactivated[%filename])
    {
        // get header if the file exists
        if(isFile(%filename))
            $script[%filename].getHeader();

        // log deactivated error
        %this.logDeactivated(%filename);

        // move the script into the failed group
        %this.failedGroup.add($script[%filename]);

        return $script[%filename].status = $SCRIPT_DEACTIVATED;
    }

    // does the file exist?
    if(!isFile(%filename))
    {
        // log missing error
        %this.logDoesNotExist(%filename);

        // move the script into the failed group
        %this.failedGroup.add($script[%filename]);

        return $script[%filename].status = $SCRIPT_DOES_NOT_EXIST;
    }

    // get the header
    $script[%filename].getHeader();

    // version check:
    // is the script's version less than the minimum version required (if set)?
    if( (%minimum_version !$= "") && ($script[%filename].versionCompare(%minimum_version) == -1) )
    {
        // move the script into the failed group
        %this.failedGroup.add($script[%filename]);

        return $script[%filename].status = $SCRIPT_VERSION_NOT_MET;
    }

    // does this script have any includes?
    if($script[%filename].includeCount)
    {
        // process each include file
        for(%i = 0; %i < $script[%filename].includeCount; %i++)
        {
            // check for include == SELF
            if( !stricmp($script[%filename].include[%i],"SELF") )
            {
                if(%nocalls)
                {
                    if(!isObject(%this.processedGroup))
                        %this.processedGroup = new SimGroup();

                    // move the script into the processed group
                    %this.processedGroup.add($script[%filename]);

                    $script[%filename].status = $SCRIPT_PROCESSED;
                    continue;
                }

                if(exec(%filename))
                {
                    if(!isObject(%this.loadedGroup))
                        %this.loadedGroup = new SimGroup();

                    // move the script into the loaded group
                    %this.loadedGroup.add($script[%filename]);

                    $script[%filename].status = $SCRIPT_EXECUTED;
                    %this.logExecuted(%filename);
                }
                else
                {
                    if(!isObject(%this.failedGroup))
                        %this.failedGroup = new SimGroup();

                    // move the script into the failed group
                    %this.failedGroup.add($script[%filename]);

                    $script[%filename].status = $SCRIPT_SYNTAX_ERROR;
                    %this.logSyntaxError(%filename);
                }
                continue;
            }

            // recursively call this function to process each include file
            // and any includes they each might have
            if( (%status_returned = %this.processFile($script[%filename].include[%i], $script[%filename].minimum_version[%i], "", %nocalls)) > $SCRIPT_EXECUTED )
            {
                // the included file failed (returned an error status),
                // so set the calling script's status to _REQUIREMENTS_NOT_MET,
                // but only if the calling script's status hasn't already been set
                // (for instance, not if it has executed already because of a "#SELF"
                // or "#include = SELF" directive)
                if(!$script[%filename].status)
                {
                    // move the script into the failed group
                    %this.failedGroup.add($script[%filename]);

                    if(%status_returned == $SCRIPT_VERSION_NOT_MET)
                    {
                        %this.logVersionNotMet(%filename, $script[%filename].include[%i], $script[%filename].minimum_version[%i]);
                        return $script[%filename].status = $SCRIPT_VERSION_NOT_MET;
                    }
                    else
                    {
                        %this.logRequirementsNotMet(%filename);
                        return $script[%filename].status = $SCRIPT_REQUIREMENTS_NOT_MET;
                    }
                }
            }
        }
    }
    // all includes have been processed

    // if this script's status was already set
    // (whether to an error level or to _EXECUTED)
    // then we're already done processing, so just return the status level
    // (no need to log the status as that should already have been done)
    if($script[%filename].status)
        return $script[%filename].status;

    // if %nocalls flag is set then we don't want to execute anything
    if(%nocalls)
    {
        if(!isObject(%this.processedGroup))
            %this.processedGroup = new SimGroup();

        // move the script into the processed group
        %this.processedGroup.add($script[%filename]);

        return $script[%filename].status = $SCRIPT_PROCESSED;
    }

    // if we make it past the test above, then all requirements are met
    // and the script hasn't been executed yet, so "make it so, number one"
    if(exec(%filename))
    {
        if(!isObject(%this.loadedGroup))
            %this.loadedGroup = new SimGroup();

        // move the script into the loaded group
        %this.loadedGroup.add($script[%filename]);

        %this.logExecuted(%filename);
        return $script[%filename].status = $SCRIPT_EXECUTED;
    }
    else
    {
        if(!isObject(%this.failedGroup))
            %this.failedGroup = new SimGroup();

        // move the script into the failed group
        %this.failedGroup.add($script[%filename]);

        %this.logSyntaxError(%filename);
        return $script[%filename].status = $SCRIPT_SYNTAX_ERROR;
    }
}


function autoload::main(%this)
{
    if(!isObject(%this.ini_handle))
        %this.ini_handle = new FileObject();

    if(!isObject(%this.log_handle))
        %this.log_handle = new FileObject();

    if(!isObject(%this.loadedGroup))
        %this.loadedGroup = new SimGroup();

    if(!isObject(%this.failedGroup))
        %this.failedGroup = new SimGroup();

    // read autoload.ini into an array
    if(isFile($AutoloadIni))
    {
        // open/re-open the file to move to the start of it
        if(!%this.ini_handle.openForRead($AutoloadIni))
        {
            %this.logCannotReadAutoloadIni();
            return false;
        }

        // read lines into storage
        for(%i = 1; !%this.ini_handle.isEOF(); %i++)
            %this.ini_line[%i] = %this.ini_handle.readLine();

        if(%i > 1)
            %this.ini_line_count = %i - 1;
        else
            %this.build_default_ini_header();

        %this.ini_handle.close();
    }
    else // autoload.ini doesn't exist, so let's build the default header
    {
        %this.build_default_ini_header();
    }

    // open the ini file for write access (and move to the start of it)
    if(!%this.ini_handle.openForWrite($AutoloadIni))
    {
        %this.logCannotWriteAutoloadIni();
        return false;
    }

    // open the log file for write access (and move to the start of it)
    if(!%this.log_handle.openForWrite($AutoloadLog))
    {
        echo("");
        echo(" - - - - - - WARNING: unable to write to " @ $AutoloadLog);
        echo(" - - - - - - autoload logging disabled!");
        echo("");
        %this.log_handle.delete();
    }

    // rebuild the .ini file
    for(%i = 1; %i <= %this.ini_line_count; %i++)
        %this.ini_handle.writeLine(%this.ini_line[%i]);

    %this.logAutoloadStarted(); // or something :)

    // process the files that were already listed in the .ini first
    // building the autoload.log file as we go

    echo(" - - - - - - Checking " @ $AutoloadIni @ " for files...");

    for(%i = 1; %i <= %this.ini_line_count; %i++)
    {
        %ini_line = trim(%this.ini_line[%i]);

        if(%ini_line $= "")
            continue;

        %filename = %this.get_filename(%ini_line);

        if(%filename $= "")
            continue;

        echo(" + '" @ %filename @ "' found in " @ $AutoloadIni);

        // check for deactivated file
        %comment_pos = strstr(%ini_line, ";");
        if(%comment_pos != -1)
        {
            %filename_pos = strstr(%ini_line, %filename);

            // a file is deactivated if it comes after the ini comment char (;)
            if(%filename_pos > %comment_pos)
            {
                %this.isDeactivated[%filename] = true;
                %this.logDeactivated(%filename);

                // don't process the file
                continue;
            }
            else
            {
                %this.isDeactivated[%filename] = false;
            }
        }
        else
        {
            %this.isDeactivated[%filename] = false;
        }

        // process file, no minimum version, %from_ini set to true
        %this.processFile(%filename, "", true);
    }

    if(!%this.log_disabled)
    {
        %this.log_handle.writeLine("");
        %this.log_handle.writeLine("Searching for new files to autoload...");
        %this.log_handle.writeLine("");
    }

    if($SkipNewAutoloadScripts $= "")
    {
        // now search for files below base and process anything with an #autoload directive
        echo(" - - - - - - Searching for new .cs files to autoload...");
    
        for(%filename = findFirstFile("*.cs"); %filename !$= ""; %filename = findNextFile("*.cs"))
        {
            // testing all the built-in scripts can take a while, so let's
            // skip certain directories altogether
    
            if($prefs::autoloadAllDirs)
            {
                %skip = false;
                %slash_pos = strstr(%filename, "/");
                if(%slash_pos != -1)
                {
                    switch$(getSubStr(%filename, 0, %slash_pos))
                    {
                        case "shapes":
                            %skip = true;
                        case "scripts":
                            %skip = true;
                        case "terrains":
                            %skip = true;
                    }
                }
    
                if(%skip)
                    continue;
            }
    
            if(%this.get_autoload(%filename) && !%this.isDeactivated[%filename])
            {
                if(!isObject($script[%filename]))
                {
                    echo(" + '" @ %filename @ "' found (with autoload enabled)");
                    %this.ini_handle.writeLine(%filename);
    
                    %this.processFile(%filename);
                }
            }
        }
    
        echo(" - - - - - - Searching for new .gui files to autoload...");
    
        for(%filename = findFirstFile("*.gui"); %filename !$= ""; %filename = findNextFile("*.gui"))
        {
            if(%this.get_autoload(%filename) && !%this.isDeactivated[%filename])
            {
                if(!isObject($script[%filename]))
                {
                    echo(" + '" @ %filename @ "' found (with autoload enabled)");
                    %this.ini_handle.writeLine(%filename);
    
                    %this.processFile(%filename);
                }
            }
        }
    }
    // autoload is done...whew

    if(isObject(%this.log_handle))
    {
        %this.log_handle.writeLine("");
        %this.log_handle.writeLine("Autoload completed!");
        %this.log_handle.close();
        %this.log_handle.delete();
    }

    // if the AutoloadRemoveFailedScripts flag is set
    if($AutoloadRemoveFailedScripts)
    {
        // removed any scripts that failed from the autoload.ini file
        for(%i = 0; %i < %this.failedGroup.getCount(); %i++)
        {
            %obj = %this.failedGroup.getObject(%i);
            %this.ini_handle.removeLinesFromFile($AutoloadIni, %obj.filename);
        }
        %this.failedGroup.clear();
    }

    %this.ini_handle.close();
    %this.ini_handle.delete();

    echo(" - - - - - - autoload done!");
    echo("");

    //
    // add all the options GUIs to the script browser
    //
    // Each options GUI will be shown or hidden as the items in the
    // SB_Scripts list are selected.
    //
    // Having all the options GUIs contained in the SB_OptionsPane from the
    // start allows them to be resized when the resolution changes.
    //

    echo("");
    echo(" - - - - - - adding options GUIs to script browser");

    // add the options guis for all the scripts that were executed
    for(%i = 0; %i < autoload.loadedGroup.getCount(); %i++)
    {
        %obj = autoload.loadedGroup.getObject(%i);

        if(isobject(%obj.config))
        {
            echo(" + adding options GUI named '" @ %obj.config @ " for '" @ %obj.filename);
            SB_OptionsPane.add(%obj.config);
            %obj.config.setVisible(0);
        }
    }

    // add the options guis for all the scripts that failed
    for(%i = 0; %i < autoload.failedGroup.getCount(); %i++)
    {
        %obj = autoload.loadedGroup.getObject(%i);

        if(isobject(%obj.config))
        {
            echo(" + adding options GUI named '" @ %obj.config @ " for '" @ %obj.filename);
            SB_OptionsPane.add(%obj.config);
            %obj.config.setVisible(0);
        }
    }

    echo(" - - - - - - options GUIs added!");
    echo("");
}


function autoload::logAutoloadStarted(%this)
{
    if(!isObject(%this.log_handle))
        return;

    %this.log_handle.writeLine("Tribes 2 Script Manager / Preprocessor Log"); // would be nice to output date/time here
    %this.log_handle.writeLine("");
    %this.log_handle.writeLine("Processing " @ $AutoloadIni @ " file...");
    %this.log_handle.writeLine("");
}

function autoload::logCannotReadAutoloadIni(%this)
{
    if(!isObject(%this.log_handle))
        return;

    %this.log_handle.writeLine("FATAL ERROR: can't read " @ $AutoloadIni @ " file");
    %this.log_handle.writeLine("autoload.cs aborted");
}

function autoload::logCannotWriteAutoloadIni(%this)
{
    if(!isObject(%this.log_handle))
        return;

    %this.log_handle.writeLine("FATAL ERROR: can't write to " @ $AutoloadIni @ " file");
    %this.log_handle.writeLine("autoload.cs aborted");
}

function autoload::logExecuted(%this, %filename)
{
    if(!isObject(%this.log_handle))
        return;

    %this.log_handle.writeLine("LOADED: " @ %filename @ " has been executed successfully");
}

function autoload::logReexecuted(%this, %filename)
{
    if(!isObject(%this.log_handle))
        return;

    %this.log_handle.writeLine("RELOADED: " @ %filename @ " has been executed again");
}

function autoload::logDeactivated(%this, %filename)
{
    if(!isObject(%this.log_handle))
        return;

    %this.log_handle.writeLine("FAILED: " @ %filename @ " was deactivated with ;");
}

function autoload::logDoesNotExist(%this, %filename)
{
    if(!isObject(%this.log_handle))
        return;

    %this.log_handle.writeLine("FAILED: " @ %filename @ " does not exist");
}

function autoload::logRequirementsNotMet(%this, %filename)
{
    if(!isObject(%this.log_handle))
        return;

    %this.log_handle.writeLine("FAILED: " @ %filename @ " could not load all its #include files ");
}

function autoload::logVersionNotMet(%this, %filename, %failed_include_file, %minimum_version)
{
    if(!isObject(%this.log_handle))
        return;

    %this.log_handle.writeLine("FAILED: " @ %filename @ " requires version " @ %minimum_version @ " of " @ %failed_include_file @ " or better");
}

function autoload::logSyntaxError(%this, %filename)
{
    if(!isObject(%this.log_handle))
        return;

    %this.log_handle.writeLine("FAILED: " @ %filename @ " generated a syntax error");
}

function autoload::logInvalidFilename(%this, %filename)
{
    if(!isObject(%this.log_handle))
        return;

    %this.log_handle.writeLine("FAILED: " @ %filename @ " is not a valid filename (does not end with .cs or .gui)");
}


// pseudo destructor -- call this instead of delete() to delete all associated objects
function autoload::destroy(%this)
{
    if(isObject(%this.ini_handle))
    {
        %this.ini_handle.close();
        %this.ini_handle.delete();
    }

    if(isObject(%this.log_handle))
    {
        %this.log_handle.close();
        %this.log_handle.delete();
    }

    if(isObject(%this.processedGroup))
        %this.processedGroup.delete();

    if(isObject(%this.loadedGroup))
        %this.loadedGroup.delete();

    if(isObject(%this.failedGroup))
        %this.failedGroup.delete();

    %this.delete();
}

function AutoloadStart()
{
    if(!isObject(ScriptBrowserTextArrayProfile))
    {
        new GuiControlProfile ("ScriptBrowserTextArrayProfile")
        {
           fontType = $ShellFont;
           fontSize = $ShellFontSize;
           fontColor   = "60 180 180";
           fontColorHL = "6 245 215";
           fontColorNA = "108 108 108";
           fontColorSEL = "25 68 56";
           bitmapBase = "gui/shll_bar";
           tab = true;
           canKeyFocus = true;
        };
    }

    if(!isObject(ScriptBrowserGui))
    {
        new GuiChunkedBitmapCtrl(ScriptBrowserGui) {
        	profile = "GuiContentProfile";
        	horizSizing = "width";
        	vertSizing = "height";
        	position = "0 0";
        	extent = "640 480";
        	minExtent = "8 8";
        	visible = "1";
            hideCursor = "0";
            bypassHideCursor = "0";
        	variable = "$ShellBackground";
        	helpTag = "0";
        	useVariable = "1";

        	new ShellPaneCtrl(SB_Frame)
        	{
        		profile = "ShellPaneProfile";
        		horizSizing = "width";
        		vertSizing = "height";
        		position = GM_Frame.position; // "12 13";
        		extent = GM_Frame.extent; // "620 423";
        		minExtent = "48 92";
        		visible = "1";
                hideCursor = "0";
                bypassHideCursor = "0";
        		helpTag = "0";
        		text = "SCRIPTS";
        		maxLength = "255";
        		noTitleBar = "0";

        		new ShellTabFrame(SB_TabFrame) {
        			profile = "ShellHorzTabFrameProfile";
        			horizSizing = "width";
        			vertSizing = "bottom";
        			position = "22 54";
        			extent = "576 254";
        			minExtent = "26 254";
        			visible = "1";
                    hideCursor = "0";
                    bypassHideCursor = "0";
        			helpTag = "0";
        			isVertical = "0";
        			useCloseButton = "0";
        			edgeInset = "0";
        		};
        		new ShellTabGroupCtrl(SB_TabView) {
        			profile = "TabGroupProfile";
        			horizSizing = "width";
        			vertSizing = "bottom";
        			position = "30 25";
        			extent = "560 29";
        			minExtent = "38 29";
        			visible = "1";
                    hideCursor = "0";
                    bypassHideCursor = "0";
        			helpTag = "0";
        			glowOffset = "7";
        			tabSpacing = "2";
        			maxTabWidth = "150";
        			stretchToFit = "0";
        		};
        		new GuiControl(SB_ScriptsPane) {
        			profile = "GuiDefaultProfile";
        			horizSizing = "right";
        			vertSizing = "height";
        			position = "23 55";
        			extent = "180 " @ getword(SB_Frame.extent, 1) - 70;// 320";
        			minExtent = "8 8";
        			visible = "1";
                    hideCursor = "0";
                    bypassHideCursor = "0";
        			helpTag = "0";

    				new ShellPopupMenu(SB_Category) {
    					profile = "ShellPopupProfile";
    					horizSizing = "right";
    					vertSizing = "bottom";
    					position = "5 4";
    					extent = "180 36";
    					minExtent = "175 36";
    					visible = "1";
                        hideCursor = "0";
                        bypassHideCursor = "0";
    					helpTag = "0";
    					text = "";
    					maxLength = "255";
    					maxPopupHeight = "200";
    					buttonBitmap = "gui/shll_pulldown";
    					rolloverBarBitmap = "gui/shll_pulldownbar_rol";
    					selectedBarBitmap = "gui/shll_pulldownbar_act";
    					noButtonStyle = "0";
    				};

        			new ShellScrollCtrl() {
        				profile = "NewScrollCtrlProfile";
        				horizSizing = "right";
        				vertSizing = "height";
        				position = "5 32";
        				extent = "175 " @ getword(SB_Frame.extent, 1) - 100;// 290";
        				minExtent = "24 52";
        				visible = "1";
                        hideCursor = "0";
                        bypassHideCursor = "0";
        				helpTag = "0";
        				willFirstRespond = "1";
        				hScrollBar = "alwaysOff";
        				vScrollBar = "dynamic";
        				constantThumbHeight = "0";
        				defaultLineHeight = "15";
        				childMargin = "0 3";
        				fieldBase = "gui/shll_field";

        				new GuiScrollContentCtrl() {
        					profile = "GuiDefaultProfile";
        					horizSizing = "right";
        					vertSizing = "bottom";
        					position = "4 7";
        					extent = "167 " @ getword(SB_Frame.extent, 1) - 114;//276";
        					minExtent = "8 8";
        					visible = "1";
                            hideCursor = "0";
                            bypassHideCursor = "0";
        					helpTag = "0";

        					new ShellTextList(SB_Scripts) {
        						profile = "ScriptBrowserTextArrayProfile";
        						horizSizing = "right";
        						vertSizing = "bottom";
        						position = "0 0";
        						extent = "167 8";
        						minExtent = "8 8";
        						visible = "1";
                                hideCursor = "0";
                                bypassHideCursor = "0";
        						helpTag = "0";
        						enumerate = "0";
        						resizeCell = "1";
        						columns = "0";
        						fitParentWidth = "1";
        						clipColumnText = "0";
        					};
        				};
        			};
        		};
        		new GuiControl(SB_OptionsPane) {
        			profile = "GuiDefaultProfile";
        			horizSizing = "width";
        			vertSizing = "height";
        			position = "198 55";
        			extent = "400 " @ getword(SB_Frame.extent, 1) - 70;// 320";
        			minExtent = "8 8";
        			visible = "1";
                    hideCursor = "0";
                    bypassHideCursor = "0";
        			helpTag = "0";

        		};
        		new GuiControl(SB_ReadmePane) {
        			profile = "GuiDefaultProfile";
        			horizSizing = "width";
        			vertSizing = "height";
        			position = "198 55";
        			extent = "400 " @ getword(SB_Frame.extent, 1) - 70;// 320";
        			minExtent = "8 8";
        			visible = "1";
                    hideCursor = "0";
                    bypassHideCursor = "0";
        			helpTag = "0";

        			new ShellScrollCtrl() {
        				profile = "NewScrollCtrlProfile";
        				horizSizing = "width";
        				vertSizing = "height";
        				position = "0 6";
        				extent = "395 " @ getword(SB_Frame.extent, 1) - 74;//316";
        				minExtent = "24 24";
        				visible = "1";
                        hideCursor = "0";
                        bypassHideCursor = "0";
        				helpTag = "0";
        				willFirstRespond = "1";
        				hScrollBar = "alwaysOff";
        				vScrollBar = "dynamic";
        				constantThumbHeight = "0";
        				defaultLineHeight = "15";
        				childMargin = "0 3";
        				fieldBase = "gui/shll_field";

        				new GuiScrollContentCtrl() {
        					profile = "GuiDefaultProfile";
        					horizSizing = "width";
        					vertSizing = "bottom";
        					position = "4 7";
        					extent = "370 " @ getword(SB_Frame.extent, 1) - 88;//302";
        					minExtent = "8 8";
        					visible = "1";
                            hideCursor = "0";
                            bypassHideCursor = "0";
        					helpTag = "0";

        					new GuiMLTextCtrl(SB_Readme_Text) {
        						profile = "ShellAltTextProfile";
        						horizSizing = "width";
        						vertSizing = "bottom";
        						position = "0 0";
        						extent = "360 16";
        						minExtent = "8 8";
        						visible = "1";
                                hideCursor = "0";
                                bypassHideCursor = "0";
        						helpTag = "0";
        						lineSpacing = "2";
        						allowColorChars = "1";
        						maxChars = "-1";
        					};
        				};
        			};
        		};
        		new GuiControl(SB_InfoPane) {
        			profile = "GuiDefaultProfile";
        			horizSizing = "width";
        			vertSizing = "height";
        			position = "198 55";
        			extent = "400 " @ getword(SB_Frame.extent, 1) - 70;//320";
        			minExtent = "8 8";
        			visible = "1";
                    hideCursor = "0";
                    bypassHideCursor = "0";
        			helpTag = "0";

        			new ShellScrollCtrl() {
        				profile = "NewScrollCtrlProfile";
        				horizSizing = "width";
        				vertSizing = "height";
        				position = "0 6";
        				extent = "395 " @ getword(SB_Frame.extent, 1) - 74;//316";
        				minExtent = "24 24";
        				visible = "1";
                        hideCursor = "0";
                        bypassHideCursor = "0";
        				helpTag = "0";
        				willFirstRespond = "1";
        				hScrollBar = "alwaysOff";
        				vScrollBar = "dynamic";
        				constantThumbHeight = "0";
        				defaultLineHeight = "15";
        				childMargin = "0 3";
        				fieldBase = "gui/shll_field";

        				new GuiScrollContentCtrl() {
        					profile = "GuiDefaultProfile";
        					horizSizing = "width";
        					vertSizing = "bottom";
        					position = "4 7";
        					extent = "387 " @ getword(SB_Frame.extent, 1) - 88;//302";
        					minExtent = "8 8";
        					visible = "1";
                            hideCursor = "0";
                            bypassHideCursor = "0";
        					helpTag = "0";

        					new GuiMLTextCtrl(SB_Info_Text) {
        						profile = "ShellAltTextProfile"; //"NewTextEditProfile";
        						horizSizing = "width";
        						vertSizing = "bottom";
        						position = "0 0";
        						extent = "380 16";
        						minExtent = "8 8";
        						visible = "1";
                                hideCursor = "0";
                                bypassHideCursor = "0";
        						helpTag = "0";
        						lineSpacing = "2";
        						allowColorChars = "1";
        						maxChars = "-1";
        					};
        				};
        			};
        		};
        	};
            new ShellBitmapButton(ScriptBrowserCloseButton)
            {
                profile = "CloseButtonProfile";
                horizSizing = "left";
                vertSizing = "bottom";
                position = LaunchToolbarCloseButton.position;// "583 46";
                extent = "33 26";
                minExtent = "8 8";
                visible = "0";
                hideCursor = "0";
                bypassHideCursor = "0";
                setFirstResponder = "0";
                modal = "1";
                helpTag = "0";
                command = "ScriptBrowserGui.close();";
                text = "";
                simpleStyle = "1";
            };
       };
    }

    if( !isObject(AutoloadOptionsGui) )
    {
        new GuiControl(AutoloadOptionsGui) {
        	profile = "GuiDefaultProfile";
        	horizSizing = "width";
        	vertSizing = "height";
        	position = "0 10";
        	extent = "400 " @ getword(SB_Frame.extent, 1) - 80;//310";
        	minExtent = "8 8";
        	visible = "1";
            hideCursor = "0";
            bypassHideCursor = "0";
        	helpTag = "0";

    		new GuiTextCtrl() {
    			profile = "ShellMediumTextProfile";//"ShellTextProfile";
    			horizSizing = "right";
    			vertSizing = "bottom";
    			position = "14 4";
    			extent = "150 22";
    			minExtent = "8 8";
    			visible = "1";
                hideCursor = "0";
                bypassHideCursor = "0";
    			helpTag = "0";
    			text = "Edit the " @ $AutoloadIni @ " file:";
    			maxLength = "255";
    		};

    		new ShellScrollCtrl() {
    			profile = "NewScrollCtrlProfile";
    			horizSizing = "width";
    			vertSizing = "height";
    			position = "4 27"; // 17
    			extent = "380 " @ getword(SB_Frame.extent, 1) - 150;//240"; // 260
    			minExtent = "24 52";
    			visible = "1";
                hideCursor = "0";
                bypassHideCursor = "0";
    			helpTag = "0";
    			willFirstRespond = "1";
    			hScrollBar = "alwaysOff";
    			vScrollBar = "alwaysOn";
    			constantThumbHeight = "0";
    			defaultLineHeight = "15";
    			childMargin = "3 3";
    			fieldBase = "gui/shll_field";

    			new GuiScrollContentCtrl() {
    				profile = "GuiDefaultProfile";
    				horizSizing = "width";
    				vertSizing = "height";
    				position = "7 7";
    				extent = "350 " @ getword(SB_Frame.extent, 1) - 164;//226"; // 246
    				minExtent = "8 8";
    				visible = "1";
                    hideCursor = "0";
                    bypassHideCursor = "0";
    				helpTag = "0";

    				new GuiMLTextEditCtrl(AutoloadIniEdit) {
    					profile = "ShellMessageTextProfile";
    					horizSizing = "width";
    					vertSizing = "height";
    					position = "0 0";
    					extent = "350 " @ getword(SB_Frame.extent, 1) - 164;//226"; // 246
    					minExtent = "8 8";
    					visible = "1";
                        hideCursor = "0";
                        bypassHideCursor = "0";
    					helpTag = "0";
    					lineSpacing = "2";
    					allowColorChars = "0";
    					maxChars = "10000";
    					deniedSound = "InputDeniedSound";
    				};
    			};
    		};

    		new ShellBitmapButton(AutoloadIniReloadBtn) {
    			profile = "ShellButtonProfile";
    			horizSizing = "right";
    			vertSizing = "top";
    			position = "4 " @ getword(SB_Frame.extent, 1) - 120;//270";
    			extent = "85 38";
    			minExtent = "32 38";
    			visible = "1";
                hideCursor = "0";
                bypassHideCursor = "0";
    			command = "AutoloadOptionsGui.Reload();";
    			helpTag = "0";
    			text = "RELOAD";
    			simpleStyle = "0";
    		};
    		new ShellBitmapButton(AutoloadIniSaveBtn) {
    			profile = "ShellButtonProfile";
    			horizSizing = "right";
    			vertSizing = "top";
    			position = "80 " @ getword(SB_Frame.extent, 1) - 120;//270"; // 76 270
    			extent = "85 38";
    			minExtent = "32 38";
    			visible = "1";
                hideCursor = "0";
                bypassHideCursor = "0";
    			command = "AutoloadOptionsGui.save();";
    			helpTag = "0";
    			text = "SAVE";
    			simpleStyle = "0";
    		};

    	};
    }

    if( !isObject(LaunchSBFromLobbyButton) )
    {
        %lobby_pane = LobbyGui.findObjectByProperty("text", "LOBBY");
        %settings_button = LobbyGui.findObjectByProperty("text", "SETTINGS");

        new ShellBitmapButton(LaunchSBFromLobbyButton)
        {
            profile = "ShellButtonProfile";
            horizSizing = "left";
            vertSizing = "top";
            position = getWord(%settings_button.position, 0) - 120 @ " " @ getWord(%settings_button.position, 1);// 385";
            extent = "128 38";
            minExtent = "32 38";
            visible = "1";
            hideCursor = "0";
            bypassHideCursor = "0";
            command = "LaunchScriptBrowser();";
            helpTag = "0";
            text = "SCRIPTS";
            simpleStyle = "0";
        };

        %lobby_pane.add(LaunchSBFromLobbyButton);
    }

    if( !isObject(autoload) )
    {
        // define autoload class and invoke autoload object
        new ScriptObject(autoload)
        {
            class = autoload;
            category[0] = "All";
            category[1] = "Loaded";
            category[2] = "Failed";
            categoryCount = 3;
        };

        // process this file's header to get the includes, etc.
        // and then go ahead with the autoload if the requirements were met
        if(autoload.processFile("autoload.cs", "", "", true) == $SCRIPT_PROCESSED)
        {
            if(!isObject(autoload.loadedGroup))
                autoload.loadedGroup = new SimGroup();

            // move the files into the loaded group
            while(autoload.processedGroup.getCount())
            {
                autoload.processedGroup.getObject(%i).status = $SCRIPT_EXECUTED;
                autoload.loadedGroup.add(autoload.processedGroup.getObject(%i));
            }

            // delete the group if it isn't needed any more, since it isn't likely
            // any other scripts will need it, and it will get rebuilt if they do
            if(!autoload.processedGroup.getCount())
                autoload.processedGroup.delete();

            // we are go for go!
            autoload.main();
            //UberGuy 09/10/2002
            callback.trigger(AutoloadDone);
         }
    }
}


//-----------------------------------------------------------------------------
function AutoloadOptionsGui::onWake(%this)
{
        %file = new FileObject();
        AutoloadIniEdit.setValue( %file.getContents($AutoloadIni));
        %file.close();
        %file.delete();
}
//-----------------------------------------------------------------------------
function AutoloadOptionsGui::reload(%this)
{
        %file = new FileObject();
        AutoloadIniEdit.setValue( %file.getContents($AutoloadIni));
        %file.close();
        %file.delete();
}
//-----------------------------------------------------------------------------
function AutoloadOptionsGui::save(%this)
{
        %file = new FileObject();
        %file.write( $AutoloadIni, AutoloadIniEdit.getValue() );
        %file.close();
        %file.delete();
}


//-----------------------------------------------------------------------------
function LaunchScriptBrowser()
{
    ScriptBrowserGui.launchedFrom = Canvas.getContent();
    
	// UberGuy - add escape key functionality 09/28/2002
	if (!isObject(%this.bindMap)) {
		ScriptBrowserGui.bindMap = new ActionMap();
		ScriptBrowserGui.bindMap.bindCmd(keyboard,"escape","ScriptBrowserGui.close();","");
		ScriptBrowserGui.bindMap.push();
	}

    // turn mouse pointer on if it's off
    // (in case this was called from the PlayGui)
    if( !canvas.isCursorOn() )
        cursorOn();

    // if we're launching from the lobbygui or playgui, launch the script browser
    // all by itself, and not as a LaunchTabView tab
    if( ScriptBrowserGui.launchedFrom == LobbyGui.getId() ||
        ScriptBrowserGui.launchedFrom == PlayGui.getId() )
    {
        canvas.setContent(ScriptBrowserGui);
        ScriptBrowserCloseButton.setVisible(1);
        return;
    }
    LaunchTabView.viewTab( "SCRIPTS", ScriptBrowserGui, 0 );
}
//-----------------------------------------------------------------------------
function ScriptBrowserGui::close(%this)
{
    %this.bindMap.pop(); //UberGuy
    
//    ScriptBrowserCloseButton.setVisible(0);

    echo("setting canvas to: " @ ScriptBrowserGui.launchedFrom.getName());
    Canvas.setContent( ScriptBrowserGui.launchedFrom );

    // turn off mouse pointer if we're returning to the PlayGui
    if( ScriptBrowserGui.launchedFrom == PlayGui.getId() )
        cursorOff();
}
//-----------------------------------------------------------------------------
function ScriptBrowserGui::onWake(%this)
{
    // push the Launch tabs onto the canvas if we're viewing the script
    // browser as a Launch tab
    if( ScriptBrowserGui.launchedFrom != LobbyGui.getId() &&
        ScriptBrowserGui.launchedFrom != PlayGui.getId() )
    {
        Canvas.pushDialog(LaunchToolbarDlg);
    }

    //ScriptBrowserGui.category = SB_Category.getSelected();
    %category_id = SB_Category.getSelected();

    SB_Category.clear();

    for(%i = 0; %i < autoload.categoryCount; %i++)
    {
        SB_Category.add( autoload.category[%i], %i );
    }

	SB_Category.sort(true); //UberGuy

//    SB_Category.setSelected( ScriptBrowserGui.category );
    SB_Category.setSelected( %category_id );
    SB_Category.onSelect( SB_Category.getSelected(), SB_Category.getText() );

}
//-----------------------------------------------------------------------------
function ScriptBrowserGui::onSleep(%this)
{
    // pop the Launch tabs off the canvas if we're viewing the script
    // browser as a Launch tab
    if( ScriptBrowserGui.launchedFrom != LobbyGui.getId() &&
        ScriptBrowserGui.launchedFrom != PlayGui.getId() )
    {
        Canvas.popDialog(LaunchToolbarDlg);
    }
}
//-----------------------------------------------------------------------------
function ScriptBrowserGui::onClose(%this)
{
}
//-----------------------------------------------------------------------------
function ScriptBrowserGui::setKey(%this)
{
}
//-----------------------------------------------------------------------------
function SB_Category::onSelect( %this, %id, %text )
{
    ScriptBrowserGui.category = %text;

    // fill the scripts list
    SB_Scripts.update();
}
//-----------------------------------------------------------------------------
function SB_Scripts::update(%this)
{
    // remember the currently selected script
    %this.selected_id = %this.getSelectedId();

    // clear the scripts list
    %this.clear();

    // add all the loaded scripts
    for(%i = 0; %i < autoload.loadedGroup.getCount(); %i++)
    {
        %obj = autoload.loadedGroup.getObject(%i);
        %text = %obj.name;

        if( %obj.hide )
        {
            // skip this script -- the author wants it hidden
            continue;
        }

        if( stricmp(ScriptBrowserGui.category, "All") &&
            stricmp(ScriptBrowserGui.category, "Loaded") ) // !$=
        {
            if( stricmp(ScriptBrowserGui.category, %obj.category) ) // !$=
            {
                if(%obj == %this.selected_id)
                {
                    %this.selected_id = -1;
                }

                // skip this script -- it belongs in another category
                continue;
            }
        }

        if(%text $= "")
        {
            %text = %obj.filename;
        }

        %this.addRow(%obj, "\c0" @ %text);
    }

    // add all the scripts that failed
    for(%i = 0; %i < autoload.failedGroup.getCount(); %i++)
    {
        %obj = autoload.failedGroup.getObject(%i);
        %text = %obj.name;

        if( %obj.hide )
        {
            // skip this script -- the author wants it hidden
            continue;
        }

        if( stricmp(ScriptBrowserGui.category, "All") &&
            stricmp(ScriptBrowserGui.category, "Failed") ) // !$=
        {
            if( stricmp(ScriptBrowserGui.category, %obj.category) ) // !$=
            {
                if(%obj == %this.selected_id)
                {
                    %this.selected_id = -1;
                }

                // skip this script -- it belongs in another category
                continue;
            }
        }

        if(%text $= "")
        {
            %text = %obj.filename;
        }

        %this.addRow(%obj, "\c2" @ %text);
    }

    if( !%this.rowcount() )
    {
        SB_TabView.clear();

        SB_InfoPane.setVisible(0);
        SB_OptionsPane.setVisible(0);
        SB_ReadmePane.setVisible(0);

        %this.selected_id = -1;
        %this.previous_obj = "";
        return;
    }

    // sort the list
    %this.sort(0);

    // select the first item if this is there was no previously selected item
    // (which means this is the first time the script browser has been shown)
    if( %this.selected_id == -1)
    {
        %this.setSelectedRow( 0 );
    }
    else
    {
        %this.setSelectedById( %this.selected_id );
    }
}
//-----------------------------------------------------------------------------
function SB_Scripts::onSelect( %this, %obj, %text )
{
    // need to handle the color change for the selected item's text ourselves
    // because the \c0 in the row text overrides the default font color change
    if( strstr( %text, "\c0") != -1)
    {
        %this.setRowById( %obj, strreplace(%text, "\c0", "\c3"));
        %previous_color = "\c0";
    }
    else if( strstr( %text, "\c2") != -1)
    {
        %this.setRowById( %obj, strreplace(%text, "\c2", "\c3"));
        %previous_color = "\c2";
    }

    // do nothing if we've reselected the previously selected item
    if( %obj == %this.previous_obj )// && SB_TabView.getCount())
        return;

    SB_InfoPane.setVisible(1);
    SB_OptionsPane.setVisible(0);
    SB_ReadmePane.setVisible(0);

    SB_TabView.clear();

//    //
//    // note: UpgraderField is instanced in update_tools.cs and contains
//    //       all the info required to provide the update functionality
//    //
//
//    // remove any UpgraderField object that was used by the previous script
//    if( isObject(UpgraderField) )
//        UpgraderField.delete();

    SB_TabView.addTab( 1, "INFO" );
    %this.setInfoText(%obj, %text);

    if( isobject(%this.previous_obj) )
    {
        // reset the color of the previously selected item :)
        %this.setRowById( %this.previous_obj, strreplace(%this.getRowTextById(%this.previous_obj), "\c3", %this.previous_color));

        // hide the previous options gui
        if( %this.previous_obj.config !$= "" )
        {
            %this.previous_obj.config.setVisible(0);
        }
    }

    %this.previous_color = %previous_color;

    if ( %obj.config !$= "" && isObject(%obj.config) )//&& (%obj != %this.previous_obj) )
    {
        SB_TabView.addTab( 2, "OPTIONS" );

        // show the script's config gui on the options pane
        %obj.config.setVisible(1);

        // alert the script that its options GUI is on deck
        %obj.config.onWake();
    }

    if ( %obj.readme !$= "" )
    {
        SB_TabView.addTab( 3, "README" );

        %this.setReadmeText(%obj, %text);
    }

    %this.previous_obj = %obj;

    // select the INFO tab
    SB_TabView.setSelected( 1 );
}
//-----------------------------------------------------------------------------
function SB_Scripts::setReadmeText( %this, %obj, %text )
{
    %file = new FileObject();
    SB_Readme_Text.setValue("<lmargin:10><just:left><font:Courier New:16><color:c0c0c0>"@ %file.getContents(%obj.readme));
    %file.close();
    %file.delete();
}

//-----------------------------------------------------------------------------
function SB_Scripts::setInfoText( %this, %obj, %text )
{
    %info_text = "";

    %header_start = "<tab:110,180><lmargin:10><spush><color:c0c0c0>";
    %header_end = "<spop><lmargin:110>";

    %body_start = "";
    %body_end = "";

    %need_space = false;

    if( %obj.name !$= "" )
    {
        %info_text = %info_text @ %header_start @ "NAME:" @ %header_end TAB %body_start @ %obj.name @ %body_end NL "";
    }

    if( %obj.description !$= "" )
    {
        if(%need_space)
        {
            %info_text = %info_text NL "";
            %need_space = false;
        }

        %info_text = %info_text @ %header_start @ "DESCRIPTION:" @ %header_end TAB %body_start @ %obj.description @ %body_end NL "";
        %need_space = true;
    }

    if( %obj.filename !$= "" )
    {
        if(%need_space)
        {
            %info_text = %info_text NL "";
            %need_space = false;
        }

        %info_text = %info_text @ %header_start @ "FILENAME:" @ %header_end TAB %body_start @ %obj.filename @ %body_end NL "";
    }

    if(%need_space)
    {
        %info_text = %info_text NL "";
        %need_space = false;
    }

    %info_text = %info_text @ %header_start @ "STATUS:" @ %header_end TAB %body_start @ "<spush><color:80c090>" @ autoload.translate(%obj.status) @ "<spop> - " @ autoload.translate(%obj.status, true) @ %body_end NL "";
    %need_space = true;

    if( %obj.status > $SCRIPT_DEACTIVATED )
    {
        // give user the option to remove the script's line from the .ini file
//        %info_text = %info_text NL %header_start @ %header_end TAB %body_start @ "[<spush><color:ADFFFA> <a:callback\tautoloadRemoveFromIni\t" @ %obj.getID() @ ">Remove this script from the " @ $AutoloadIni @ " file</a> <spop>]" @ %body_end NL "" NL "";
        %info_text = %info_text NL %header_start @ %header_end TAB %body_start @ "[<spush><color:ADFFFA> <a:removeFromIni\t" @ %obj.getID() @ ">Remove this script from the " @ $AutoloadIni @ " file</a> <spop>]" @ %body_end NL "" NL "";
    }

    if( %obj.versionString !$= "" )
    {
        if(%need_space)
        {
            %info_text = %info_text NL "";
            %need_space = false;
        }
        %info_text = %info_text @ %header_start @ "VERSION:" @ %header_end TAB %body_start @ %obj.versionString @ %body_end NL "";
    }

    if( %obj.date !$= "" )
    {
        if(%need_space)
        {
            %info_text = %info_text NL "";
            %need_space = false;
        }
        %info_text = %info_text @ %header_start @ "DATE:" @ %header_end TAB %body_start @ %obj.date @ %body_end NL "";
    }

    if( %obj.statusString !$= "" )
    {
        if(%need_space)
        {
            %info_text = %info_text NL "";
            %need_space = false;
        }

        %info_text = %info_text @ %header_start @ "STATUS:" @ %header_end TAB %body_start @ %obj.statusString @ %body_end NL "";
        %need_space = true;
    }

    if( %obj.author !$= "" )
    {
        if(%need_space)
        {
            %info_text = %info_text NL "";
            %need_space = false;
        }
        %info_text = %info_text @ %header_start @ "AUTHOR:" @ %header_end TAB %body_start @ %obj.author @ %body_end NL "";
        %need_space = true;
    }

    if( %obj.warrior !$= "" )
    {
        if(%need_space)
        {
            %info_text = %info_text NL "";
            %need_space = false;
        }

        %info_text = %info_text @ %header_start @ "WARRIOR:" @ %header_end TAB %body_start @ %obj.warrior TAB "[<spush><color:ADFFFA> <a:email" TAB %obj.warrior @ ">Contact</a> | <a:addBuddy" TAB %obj.warrior @ ">Add to buddy list</a> <spop>]" @ %body_end NL "";
        %need_space = true;
    }

    if(%obj.emailCount)
    {
        if(%need_space)
        {
            %info_text = %info_text NL "";
            %need_space = false;
        }

        for(%i = 0; %i < %obj.emailCount; %i++)
        {
            if(%i)
            {
                // not first line
                %info_text = %info_text @ %header_start @ %header_end TAB %body_start @ %obj.email[%i]
                                                        @ "<spush><color:80c090>" @ %obj.emailComment[%i] @ "<spop>" @ %body_end NL "";
            }
            else
            {
                // first line
                %info_text = %info_text @ %header_start @ "EMAIL:" @ %header_end TAB %body_start @ %obj.email[%i]
                                                                   @ "<spush><color:80c090>" @ %obj.emailComment[%i] @ "<spop>" @ %body_end NL "";
            }
        }
        %need_space = true;
    }

    if(%obj.webCount)
    {
        if(%need_space)
        {
            %info_text = %info_text NL "";
            %need_space = false;
        }

        for(%i = 0; %i < %obj.webCount; %i++)
        {
            if(%i)
            {
                // not first line

                // strip off the http:// if present
                %pos = strstr(%obj.web[%i], "http://");

                if(%pos == -1)
                {
                    %info_text = %info_text @ %header_start @ %header_end TAB %body_start @ "<a:" @ %obj.web[%i] @ ">" @ %obj.web[%i] @"</a>" @ %body_end NL "";
                }
                else
                {
                    %pos += 7;
                    %info_text = %info_text @ %header_start @ %header_end TAB %body_start @ "<a:" @ getSubStr(%obj.web[%i], %pos, 10000) @ ">" @ %obj.web[%i] @"</a>" @ %body_end NL "";
                }
            }
            else
            {
                // first line

                // strip off the http:// if present
                %pos = strstr(%obj.web[%i], "http://");

                if(%pos == -1)
                {
                    %info_text = %info_text @ %header_start @ "WEB:" @ %header_end TAB %body_start @ "<a:" @ %obj.web[%i] @ ">" @ %obj.web[%i] @"</a>" @ %body_end NL "";
                }
                else
                {
                    %pos += 7;
                    %info_text = %info_text @ %header_start @ "WEB:" @ %header_end TAB %body_start @ "<a:" @ getSubStr(%obj.web[%i], %pos, 10000) @ ">" @ %obj.web[%i] @"</a>" @ %body_end NL "";
                }
            }
        }
        %need_space = true;
    }

    if(%obj.creditCount)
    {
        if(%need_space)
        {
            %info_text = %info_text NL "";
            %need_space = false;
        }

        for(%i = 0; %i < %obj.creditCount; %i++)
        {
            if(%i)
            {
                // not first line
                %info_text = %info_text @ %header_start @ %header_end TAB %body_start @ %obj.credit[%i] @ %body_end NL "";
            }
            else
            {
                // first line
                %info_text = %info_text @ %header_start @ "CREDITS:" @ %header_end TAB %body_start @ %obj.credit[%i] @ %body_end NL "";
            }
        }
        %need_space = true;
    }

    if(%obj.includeCount)
    {
        if(%need_space)
        {
            %info_text = %info_text NL "";
            %need_space = false;
        }

        for(%i = 0; %i < %obj.includeCount; %i++)
        {
            if( %obj.include[%i] $= "SELF" )
                continue;

            if(%i)
            {
                // not first line
                %info_text = %info_text @ %header_start @ %header_end TAB %body_start @ %obj.include[%i] @ %body_end NL "";
            }
            else
            {
                // first line
                %info_text = %info_text @ %header_start @ "REQUIRES:" @ %header_end TAB %body_start @ %obj.include[%i] @ %body_end NL "";
            }
        }
        %need_space = true;
    }

//    if( %obj.update !$= "" )
//    {
//        if(%need_space)
//        {
//            %info_text = %info_text NL "";
//            %need_space = false;
//        }
//
//        %info_text = %info_text @ %header_start @ "UPDATE:" @ %header_end TAB %body_start @ "[ <spush><color:ADFFFA><a:update\ttrue>Check For Update</a><spop> ]" @ %body_end NL "";
//        AddUpgraderField(%obj.warrior, %obj.name, %obj.versionstring, %obj.update);
//    }

    if( %info_text $= "" )
        %info_text = %header_start @ "NO INFO, SORRY :)" @ %header_end;

    SB_Info_Text.setValue(%info_text);
}
//-----------------------------------------------------------------------------
function SB_TabView::onAdd( %this )
{
}
//-----------------------------------------------------------------------------
function SB_Info_Text::onURL(%this, %url)
{
    switch$( getField(%url, 0) )
    {
//        case "update":
//
//            // add <a:update\t...> tag -- code provided by ratorasniki (8/5/2001)
//            MessageBoxYesNo("UPDATE", "This process will check Tribalwar.com for a newer version of " @ UpgraderField.scriptname @ ". Would you like to continue?", "DoVersionCheck();", "");

        case "removeFromIni":

            autoload.removeFromIni( getField(%url, 1) );

        default:

            Parent::onURL(%this, %url);
    }
}
//-----------------------------------------------------------------------------
function SB_TabView::onSelect( %this, %id )
{
    SB_InfoPane.setVisible(0);
    SB_OptionsPane.setVisible(0);
    SB_ReadmePane.setVisible(0);

    switch(%id)
    {
        case 1:

            SB_InfoPane.setVisible(1);

        case 2:

            SB_OptionsPane.setVisible(1);

        case 3:

            SB_ReadmePane.setVisible(1);
    }
}
//-----------------------------------------------------------------------------
//-----------------------------------------------------------------------------

// add the SCRIPTS item to the launch menu :)
function SB_AddLaunchItem()
{
    LaunchToolbarMenu.insertItemAt(LaunchToolbarMenu.findItem(7, "SETTINGS"), 72, "SCRIPTS", "LaunchScriptBrowser();");
}

activatePackage(LoadLater);

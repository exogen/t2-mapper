// #name = String Tools
// #version = 1.5.1
// #date = March 18, 2001
// #category = Support
// #author = Lorne Laliberte
// #warrior = Writer
// #email = t2beta@cdnwriter.com
// #web = http://www.t2scripts.com
// #web = http://www.cdnwriter.com
// #description = Adds functions to manipulate and work with strings
// #status = release
// ---------------------------------------------------------------------------

// Test for multiple periods in isNumeric() fixed 03/20/02 by UberGuy (FT)

// weirdly enough, the printf() function will only work if I uncomment the next 9 lines!
//%p1 =
//%p2 =
//%p3 =
//%p4 =
//%p5 =
//%p6 =
//%p7 =
//%p8 =
//%p9;

function printf(%s, %p1, %p2, %p3, %p4, %p5, %p6, %p7, %p8, %p9)
{
    for(%i = 1; (strstr(%s, "%" @ %i) != -1) && (%i < 10); %i++)
        %s = strreplace(%s, "%" @ %i, %p[%i]);

    return %s;
}


// get a filename (with path) from %text, assuming the filename starts at
// the beginning of %text
//
// set %numeric to true to allow filenames with all-numeric extensions
// like .001 etc.
//
// set %isfile to true to only return the filename if the file is visible to
// Tribes 2 (i.e. not .ds0 files, etc)
//
// returns "" if no filename found
function getFilename(%text, %numeric, %isfile)
{
    %ext = firstWord(fileExt(%text));

    if(!%numeric)
    {
        while( (%ext !$= "") && isNumeric(%ext) )
        {
            %text = getSubStr(%text, 0, strstr(%text, %ext));
            %ext = firstWord(fileExt(%text));
        }
    }

    if(%ext !$= "")
    {
        %end_pos = strstr(%text, %ext) + strlen(%ext);

        if( %isfile && !isFile(getSubStr(%text, 0, %end_pos)) )
            return "";

        return getSubStr(%text, 0, %end_pos);
    }

    return "";
}


// returns true if %text consists of nothing but digits and/or decimals
// note: rejects strings with more than one decimal, or with a + or - as anything but the first character
// (+ or - are only allowed as the first character in the string)
function isNumeric(%text)
{
    for(%i = 0; (%char = getSubStr(%text, %i, 1)) !$= ""; %i++)
    {
        switch$(%char)
        {
            case "0":
                continue;
            case "1":
                continue;
            case "2":
                continue;
            case "3":
                continue;
            case "4":
                continue;
            case "5":
                continue;
            case "6":
                continue;
            case "7":
                continue;
            case "8":
                continue;
            case "9":
                continue;
            case ".":
                if(%dot_count >= 1)
                    return false;

                %dot_count++;
                continue;
            case "-":
                if(%i) // only valid as first character
                    return false;

                continue;
            case "+":
                if(%i) // only valid as first character
                    return false;

                continue;
            default:
                return false;
        }
    }
    // %text passed the test
    return true;
}


// return line number %line (0 based) in %text
// set %delimiter to a string to break each line at (defaults to "\n")
function getLine(%text, %line, %delimiter)
{
    %line += 0; // set %line to 0 by default

    if(%delimiter $= "")
    {
        %delimiter = "\n";
        %delimiter_len = 1;
    }
    else
    {
        %delimiter_len = strlen(%delimiter);
    }

    %i = 0;
    while( (%endline_pos = strstr(%text, %delimiter)) != -1 )
    {
        if(%i == %line)
            return getSubStr(%text, 0, %endline_pos);

        %text = getSubStr(%text, %endline_pos + %delimiter_len, 1000000);
        %i++;
    }

    // check the last line
    if( (%text !$= "") && ( %i == %line) )
        return %text;

    return "";
}


// return number of lines in %text
// set %skip_whitespace to true to not count lines containing only whitespace
// set %delimiter to a string to break each line at (defaults to "\n")
function getLineCount(%text, %skip_whitespace, %delimiter)
{
    if(%delimiter $= "")
    {
        %delimiter = "\n";
        %delimiter_len = 1;
    }
    else
    {
        %delimiter_len = strlen(%delimiter);
    }

    %lines = 0;
    while( (%endline_pos = strstr(%text, %delimiter)) != -1 )
    {
        if( %skip_whitespace && (trim(getSubStr(%text, 0, %endline_pos)) $= "") )
            continue;

        %text = getSubStr(%text, %endline_pos + %delimiter_len, 1000000);
        %lines++;
    }

    if(%skip_whitespace)
        %text = trim(%text);

    // count last line if it exists
    if(%text !$= "")
        %lines++;

    return %lines;
}


// shortcut for calling getLineCount with %skip_whitespace set
function getTextLineCount(%text, %delimiter)
{
    return getLineCount(%text, true, %delimiter);
}


// replaces the built-in firstWord() and getWord() functions
package getWordOverrides {

// temporary replacement for firstWord()
function firstWord(%text)
{
    return parent::firstWord(trim(%text));
}

}; // -- end of package: getWordOverrides

activatePackage(getWordOverrides);


// ---------------------------------------------------------------------------
// Date functions
//
// The following date functions are designed to operate on strings where:
//
// - the day is expressed as an integer of 1 or 2 digits
// - the year is expressed as a 4-digit integer
// - the month is expressed as either a three-letter word (Nov)
//   or with the full month name (November)
//
// Currently no ##/##/## formats are supported to avoid internationalization
// issues.
// ---------------------------------------------------------------------------


// get the month from %text as an int from 1 to 12
// returns "" if month not found
function getMonthFromString(%text)
{
    %text = trim(%text);

    for(%i = 0; (%word = getword(%text, %i)) !$= ""; %i++)
    {
        //...use first 3 letters to help minimize errors from spelling mistakes
        %month = getSubStr(%word, 0, 3);
        switch$(%month)
        {
            case "jan":
                return 1;
            case "feb":
                return 2;
            case "mar":
                return 3;
            case "apr":
                return 4;
            case "may":
                return 5;
            case "jun":
                return 6;
            case "jul":
                return 7;
            case "aug":
                return 8;
            case "sep":
                return 9;
            case "oct":
                return 10;
            case "nov":
                return 11;
            case "dec":
                return 12;
        }
    }
    return ""; // month not found
}


// get the year from %text as a 4-digit integer
// returns "" if year not found
function getYearFromString(%text)
{
    %text = trim(%text);

    for(%i = 0; (%word = getword(%text, %i)) !$= ""; %i++)
    {
        if( isNumeric(%word) && (strlen(%word) == 4) )
            return %word;
    }
    return ""; // year not found
}


// get the day from %text as an integer
// returns "" if year not found
function getDayFromString(%text)
{
    %text = trim(%text);

    for(%i = 0; (%word = getword(%text, %i)) !$= ""; %i++)
    {
        // remove any trailing commas
        %comma_pos = strstr(%word, ",");
        if(%comma_pos != -1)
            %word = getSubStr(%word, 0, %comma_pos);

        if( isNumeric(%word) && (strlen(%word) <= 2) )
            return %word;
    }
    return ""; // day not found
}

// ---------------------------------------------------------------------------
// Version functions
//
// The following version functions are designed to operate on strings using
// the standard version.revision.subrevision numbering system.
//
// In this system, 1.2.3 has a version of 1, a revision of 2 and a subrevision
// of 3.
//
// 1.10 has a version of 1 and a revision of 10, and is NEWER than 1.2, which
// has a version of 1 and a revision of 2.
// ---------------------------------------------------------------------------

// get the version number from %text
// returns "" if version not found
function getVersion(%text, %sublevel)
{
    %text = trim(%text);

    if(%text $= "")
        return "";

    %decimal_pos = strstr(%text, ".");

    while(%sublevel)
    {
        if(%decimal_pos == -1) // we aren't at the desired sublevel and there are no more levels to check
            return "";

        // skip to next sublevel
        %text = getSubStr(%text, %decimal_pos + 1, 1000);
        %decimal_pos = strstr(%text, ".");

        %sublevel--;
    }

    if(%decimal_pos == -1)
        return %text;
    else
        return getSubStr(%text, 0, %decimal_pos);
}


// get the revision number from %text
// returns "" if version not found
function getRevision(%text)
{
    return getVersion(%text, 1);
}


// get the subrevision number from %text
// returns "" if version not found
function getSubrevision(%text)
{
    return getVersion(%text, 2);
}


// compare two version strings
//
// returns 1 if %two is newer than %one
// returns -1 if %two is older than %one
// returns 0 if %two and %one are the same
function versionCompare(%one, %two)
{
    if(%two $= "")
        return 0; // no version isn't newer than anything :)

    if(%one $= "")
        return 1; // any version is newer than no version :)

    %one_version = getVersion(%one);
    %one_revision = getRevision(%one);
    %one_subrevision = getSubrevision(%one);

    %two_version = getVersion(%two);
    %two_revision = getRevision(%two);
    %two_subrevision = getSubrevision(%two);

    if(%two_version > %one_version)
        return 1;
    else if(%two_version < %one_version)
        return -1;
    else // %two_version == %one_version
    {
        if(%two_revision > %one_revision)
            return 1;
        else if(%two_revision < %one_revision)
            return -1;
        else // %two_revision == %one_revision
        {
            if(%two_subrevision > %one_subrevision)
                return 1;
            else if(%two_subrevision < %one_subrevision)
                return -1;
            else // %two_subrevision == %one_subrevision
                return 0;
        }
    }
}

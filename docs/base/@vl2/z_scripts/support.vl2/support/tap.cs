// #name = Tap Handler
// #version = 1.0.0
// #date = February 24, 2001
// #category = Support
// #author = Lorne Laliberte
// #warrior = Writer
// #email = t2beta@cdnwriter.com
// #web = http://www.t2scripts.com
// #web = http://www.cdnwriter.com
// #description = Adds functions that scripts can use to check for tapped keys or buttons
// #status = release
// ---------------------------------------------------------------------------

function tap(%name, %taptime)
{
    if(%name $= "")
        return;

    if(!%taptime)
        %taptime = 0.01;

    %obj = "tap_" @ %name;

    if( isObject(%obj) )
    {
        %obj.tapped = true;
    }
    else
    {
        new ScriptObject(%obj)
        {
            class = tap;
            tapped = true;
        };
    }

    %obj.id = %obj.schedule(%taptime, clear);
}

function wasTapped(%name)
{
    if(%name $= "")
        return false;

    return ("tap_" @ %name).tapped;
}

function deleteTap(%name)
{
    if(%name $= "")
        return;

    ("tap_" @ %name).delete();
}

function rescueTap(%name)
{
    if(%name $= "")
        return;

    cancel( ("tap_" @ %name).id );
}

function tap::clear(%this)
{
    %this.tapped = false;
}

function tap::rescue(%this)
{
    cancel(%this.id);
}

// #name = Object Tools
// #version = 0.0.1
// #date = November 25, 2000
// #category = Support
// #author = Lorne Laliberte
// #warrior = Writer
// #email = t2beta@cdnwriter.com
// #web = http://www.t2scripts.com
// #web = http://www.cdnwriter.com
// #description = Adds new functions to work with objects
// #status = beta
// ---------------------------------------------------------------------------


// find the first object in a group whose property (%property) matches %value,
// optionally using %operator to test %value against the value of the %property property
// returns the object ID (pointer) of the object if found, otherwise ""
//
// syntax: <groupobject>.findObjectByProperty(<property to test>, <value to search for> [, <operator to test with>])
//
function SimObject::findObjectByProperty(%this, %property, %value, %operator)
{
    // always buckle up...
    if(%property $= "")
        return "";

    // set default operator if none given
    if(%operator $= "")
        %operator = "$=";

    // is this the object we're looking for?
    eval("%test = (" @ %this @ "." @ %property @ " " @ %operator @ " \"" @ %value @ "\");");
    
    if(%test)
        return %this; // desired object found -- note this only finds the "first match"
       
    // this object doesn't meet the criteria, so check to see if it contains any other
    // objects, and test all the objects it contains
    %i = 0;
    while(%i < %this.getcount())
    {
        %r = %this.getObject(%i).findObjectByProperty(%property, %value, %operator);
        
        // desired object found -- note this is only finds the "first match"
        if(%r)
            return %r;

        %i++;
    }
    
    // no objects met the criteria
    return "";
}



// #name = Callback Handler
// #version = 1.2.0
// #date = June 1, 2001
// #category = Support
// #author = Lorne Laliberte
// #warrior = Writer
// #email = writer@t2scripts.com
// #email = t2beta@cdnwriter.com
// #web = http://www.t2scripts.com
// #web = http://www.cdnwriter.com
// #description = This callback class provides a sophisticated event handler for scripts
// #status = release
// ---------------------------------------------------------------------------
//
// Usage notes and examples:
//
// Assuming you use the default callback object, you can call the functions
// like so:
//
// callback.preserveOrder(foo, true);
//
//      -> sets the trigger named "foo" to preserveOrder mode
//
// %order_mode = callback.preserveOrder(foo);
//
//      -> get the current preserveOrder mode of "foo"
//
// callback.add(foo, bar);
//
//      -> attaches function bar() to a trigger named "foo"
//
// callback.add(foo, "echo(\"hello world\");");
//
//      -> would echo hello world whenever foo is triggered
//
// callback.delete(foo, bar);
//
//      -> detaches the bar() function from a trigger named "foo"
//
// If you detach a function from a trigger with multiple functions attached,
// the order of the functions that remain will only be preserved if
// preserveOrder mode is enabled for that trigger.
//
// Let's say we have functions A, B, C, D and E attached to trigger FOO.
//
// When we do callback.delete(FOO, B) with preserveOrder mode disabled
// (which is the default for all triggers), the last function in the list
// replaces the function we detach, so the list would become:
//
// A, E, C, D
//
// If preserveOrder mode is enabled for FOO, the functions are all "shifted"
// to the left to overwrite the detached function, and the list would become:
//
// A, C, D, E
//
// This preserves the order (duh :) but is slower, so it's usually best not to
// enable preserveOrder mode unless you have to.
//
// my_cb.delete();
//
//      -> deletes a callback object named my_cb -- calling this destroys
//         all the callbacks in that object permanently and irrevocably.
//
// Incidentally, if you ever need a unique callback object (not sure why but
// if you think of something let me know :), you can use:
//
// %object_id = new ScriptObject(my_cb) { class=callback; };
//
//      -> sets up a new callback object named "my_cb" and stores its ID in a
//         variable named %object_id -- you can then access all the member
//         functions using either my_cb or %object_id. So, my_cb.add()
//         and %object_id.add() both operate on the same "my_cb" object
//
// callback.trigger(foo, 500, Jeff, 23);
//
//      -> fires the trigger named "foo" and passes (500, Jeff, 23) as
//         arguments to all the functiona that are attached to it
//
// callback.triggerUntil(5, foo, "%1 $= mute;", %bar); ********
//
//      -> fires the trigger named "foo" and starts calling each of the
//         attached functions, passing the contents of the local variable %bar
//         to each function, stopping as soon as one of the functions returns
//         the string "mute"
//
// %awonderfulthingabouttriggers = callback.count(foo);
//
//      -> gets the number of functions currently attached to the trigger
//         named "foo"
//
// %atriggersawonderfulthing = callback.count();
//
//      -> gets the number of triggers that are active (have functions atached
//         to them)
//
// %test = callback.returned(bar, "%1 <= 5;");
//
//      -> returns true if any of the functions attached to bar returned a
//         value that resolves to an integer equal to or less than 5 the last
//         time the trigger named "bar" was fired
//
// %winniethepooh = callback.matchingReturns(foo, false);
//
//      -> get the number of functions attached to the trigger named "foo" that
//         returned a value that resolves to false
//
// note: callback.returned and callback.matchingreturns both require a pattern as
//       their second argument, but if the second argument doesn't contain a "%1"
//       anywhere in it, the functions will peform a string test by default.


if(!isObject(callback))
{
    // Set up our callback class to contain this script's properties and members
    // and invoke a default instance of the class as the named object "callback"
    new ScriptObject(callback)
    {
        class = callback;
        // no default properties yet, will invoke them as needed at run-time
    };
}

// use this to enable or disable preserveCallbackOrder mode
function callback::preserveOrder(%this, %trigger_name, %enable)
{
    if(%enable || %enable $= "")
        %this.ordered[%trigger_name] = true;
    else
        %this.ordered[%trigger_name] = false;
}

// use this to determine whether a trigger is currently in preserveCallbackOrder mode
function callback::isOrdered(%this, %trigger_name)
{
    return %this.ordered[%trigger_name] == true; // cast return to a bool :)
}


// attach a function to a named trigger
//
// returns true if function gets attached (i.e. was not attached already)
// returns false if function was already attached or could not be
function callback::add(%this, %trigger_name, %function)
{
    if(%function $= "" || %trigger_name $= "")
        return false;

    // Only add this function only if it isn't already attached to this event
    if(%this.index[%trigger_name, %function])
        return false;

    // (I return false in case someone wants to test whether a function by that
    // name was already attached to this trigger.)

    // If this is a new trigger name, add it to the master trigger list
    if(!%this.count[%trigger_name])
        %this.triggerList[%this.triggerCount++] = %trigger_name;

    // Increment count of functions attached to this trigger.
    // Since we'll be adding an element to the end of the %this.func array, we
    // can use the same value for the index into our %this.func array.
    // Storing that index in our %this.index array makes it easier to
    // quickly determine which element to access in the %this.func array
    // when we only know the event and the function.  (Otherwise we'd have to
    // iterate through the %this.func array looking for a match.)
    %index = %this.index[%trigger_name, %function] = %this.count[%trigger_name]++;

    // Add this function to the trigger
    %this.func[%trigger_name, %index] = %function;

    // Set flag if this function is a statement (which determines whether we'll pass any args to it).
    // This is a speed optimization to avoid having to call strStr() each time a function is triggered.
    %this.isStatement[%trigger_name, %index] = (strStr(%function, ";") != -1);

    // return true to indicate function did not previously exist and has been attached
    return true;
}


// deletes any callback object, including the default one named "callback"
// in case I ever need to get past the "callback" deletion protection in ::delete()
function callback::destruct(%this)
{
    Parent::delete(%this);
}


// detach a function from a named trigger -- note that the order of the attached functions
// is not preserved unless preserveCallbackOrder mode has been enabled for this trigger
//
// returns true if callback function was detached
// returns false if function wasn't attached to begin with
function callback::delete(%this, %trigger_name, %function)
{
    // if this function is called with no arguments, we call ScriptObject's
    // delete() member to delete the callback object itself
    if(%function $= "" && %trigger_name $= "" && %this.getName() !$= "callback")
        return Parent::delete(%this);

    if(%function $= "" || %trigger_name $= "")
        return false;

    // return false if function wasn't attached or there are no functions to detach
    if(!%this.count[%trigger_name] || !%this.index[%trigger_name, %function])
        return false;

    // Get the index of the function to detach
    %index = %this.index[%trigger_name, %function];

    // If the function we're detaching was called by the trigger we're detaching
    // it from -- in other words, if a triggered function is detaching itself --
    // the function we're replacing it with wouldn't get called until the next
    // time the callbacks are triggered.

    // %this.indexBeingTriggered holds the index of the function currently being
    // triggered...if it matches the index of the function we're detaching, we
    // set %this.indexBeingTriggered to 0 to tell the trigger routine to process
    // the replacement function after we move it into this index.

    if(%index == %this.indexBeingTriggered)
        %this.indexBeingTriggered = 0;

    // check for optional preserveOrder mode
    if(%this.ordered[%trigger_name])
    {
        // preseveOrder mode is on, so we'll shrink the array by shifting it
        // a linked list would be faster but I don't think it's worth the storage hit
        for(%i = %index; %i <= %this.count[%trigger_name]; %i++)
        {
            // get next function in the array and move it into this spot
            // (or clear this spot if it was the last one)
            %replacement =
            %this.func[%trigger_name, %i] = %this.func[%trigger_name, %i + 1];

            // do the same for the isStatement flag
            %this.isStatement[%trigger_name, %i] = %this.isStatement[%trigger_name, %i + 1];

            // if we reached the end, there is no replacement function
            // (so we don't need to adjust its index value :)
            if(%replacement $= "")
                break;

            // otherwise, adjust the replacement function's index value to reflect its new position in array
            %this.index[%trigger_name, %replacement] = %i;
        }
        // adjust callback count (number of functions attached to this trigger)
        %this.count[%trigger_name]--;

        // return true to say "function was attached, we detached it" :)
        return true;
    }

    // okay, optional preserveCallbackOrder mode is disabled for this trigger

    // get index of last element in the array
    %last = %this.count[%trigger.name];

    // move the function at the end of the array into the detached function's spot
    %replacement = %this.func[%trigger_name, %last];
    %this.func[%trigger_name, %index] = %replacement;

    // do the same for the isStatement flag
    %this.isStatement[%trigger_name, %index] = %this.isStatement[%trigger_name, %last];

    // update the index of the function we just moved
    %this.index[%trigger_name, %replacement] = %index;

    // clear out the last array element
    %this.func[%trigger_name, %last] = "";
    %this.isStatement[%trigger_name, %last] = "";

    // clear flag to show the function we detached isn't attached any more
    %this.index[%trigger_name, %function] = "";

    // adjust callback count (number of functions attached to this trigger)
    %this.count[%trigger_name]--;

    // return true to say "function was attached, we detached it" :)
    return true;
}


// call all the functions attached to a named trigger and pass from 0 to 9 parameters to each function
//
// Note:  use <object>.trigger(<trigger_name>, <parameter1>, <parameter2>, <etc>)
//        wherever you want a trigger that functions can be attached to
//
// returns the trigger name to allow for statements like returnedFromTrigger(callback.trigger(foo), true);
function callback::trigger(%this, %trigger_name, %p0, %p1, %p2, %p3, %p4, %p5, %p6, %p7, %p8, %p9, %p10, %p11, %p12, %p13, %p14)
{
    if(!%this.count[%trigger_name])
    {
        %this.returnCount[%trigger_name] = 0; // = "" instead?
        return %trigger_name;
    }

    // call every attached function in turn
    %i = 1;
    while(%i <= %this.count[%trigger_name])
    {
        %this.indexBeingTriggered = %i;
        %function = %this.func[%trigger_name, %i];

        %this.returnValue[%trigger_name, %i] = "";
        %this.returnValue[%trigger_name, %function] = "";

        if(%this.isStatement[%trigger_name, %i])
        {
            // this function is a statement so don't pass any parameters
            eval("%r=" @ %function); // eval only returns values properly when the statement is a function call
            %this.returnValue[%trigger_name, %i] = %r;
        }
        else
        {
            // this function is not a statement so pass the parameters to it
            %this.returnValue[%trigger_name, %i] = eval(%function @ "(" @  "\"" @ expandEscape(%p0)  @ "\""
                                                                        @ ",\"" @ expandEscape(%p1)  @ "\""
                                                                        @ ",\"" @ expandEscape(%p2)  @ "\""
                                                                        @ ",\"" @ expandEscape(%p3)  @ "\""
                                                                        @ ",\"" @ expandEscape(%p4)  @ "\""
                                                                        @ ",\"" @ expandEscape(%p5)  @ "\""
                                                                        @ ",\"" @ expandEscape(%p6)  @ "\""
                                                                        @ ",\"" @ expandEscape(%p7)  @ "\""
                                                                        @ ",\"" @ expandEscape(%p8)  @ "\""
                                                                        @ ",\"" @ expandEscape(%p9)  @ "\""
                                                                        @ ",\"" @ expandEscape(%p10) @ "\""
                                                                        @ ",\"" @ expandEscape(%p11) @ "\""
                                                                        @ ",\"" @ expandEscape(%p12) @ "\""
                                                                        @ ",\"" @ expandEscape(%p13) @ "\""
                                                                        @ ",\"" @ expandEscape(%p14) @ "\""
                                                                        @ ");");
        }

        // Reprocess this index (%i) if callback function detached itself (and a new function replaced it at this index)
        if(%this.indexBeingTriggered)
            %i++;
    }

    // set number of functions that returned...in this case, it's always all of them
    %this.returnCount[%trigger_name] = %this.count[%trigger_name];

    return %trigger_name;
}


// call all the functions attached to a named trigger, passing from 0 to 9
// parameters to each function, and stopping at the first function where
// the return value is evaluated (using %test and %value) into a true result.
//
// %test is a string "pattern" where %1 stands for the value returned by the function
// %test can be any statement that eval() can handle, but it must resolve to either true or false
//
// Example: "%1 $= true;" would test for a string match between the value returned from the
//          triggered function and the boolean value True.
//
// Note: if %test doesn't contain a %1 in it, the function will assume you're passing a
//       string that you want tested against the return values, so "mute" or "%1 $= mute;" are the same.
//
// returns true if an attached function returned %value, otherwise returns false
function callback::triggerUntil(%this, %test, %trigger_name, %p0, %p1, %p2, %p3, %p4, %p5, %p6, %p7, %p8, %p9, %p10, %p11, %p12, %p13, %p14)
{
    if(!%this.count[%trigger_name])
    {
        %this.returnCount[%trigger_name] = 0;
        return %trigger_name;
    }

    // call every attached function in turn
    %i = 1;
    while(%i <= %this.count[%trigger_name])
    {
        %this.indexBeingTriggered = %i;
        %function = %this.func[%trigger_name, %i];

        if(%this.isStatement[%trigger_name, %i])
        {
            // This function is a statement so don't pass any parameters
            eval("%retval=" @ %function); // eval only returns values properly when the statement is a function call
            %this.returnValue[%trigger_name, %i] = %retval;
        }
        else
        {
            // This function is not a statement so pass the parameters to it
            %retval =
            %this.returnValue[%trigger_name, %i] = eval(%function @ "(" @  "\"" @ expandEscape(%p0)  @ "\""
                                                                        @ ",\"" @ expandEscape(%p1)  @ "\""
                                                                        @ ",\"" @ expandEscape(%p2)  @ "\""
                                                                        @ ",\"" @ expandEscape(%p3)  @ "\""
                                                                        @ ",\"" @ expandEscape(%p4)  @ "\""
                                                                        @ ",\"" @ expandEscape(%p5)  @ "\""
                                                                        @ ",\"" @ expandEscape(%p6)  @ "\""
                                                                        @ ",\"" @ expandEscape(%p7)  @ "\""
                                                                        @ ",\"" @ expandEscape(%p8)  @ "\""
                                                                        @ ",\"" @ expandEscape(%p9)  @ "\""
                                                                        @ ",\"" @ expandEscape(%p10) @ "\""
                                                                        @ ",\"" @ expandEscape(%p11) @ "\""
                                                                        @ ",\"" @ expandEscape(%p12) @ "\""
                                                                        @ ",\"" @ expandEscape(%p13) @ "\""
                                                                        @ ",\"" @ expandEscape(%p14) @ "\""
                                                                        @ ");");
        }

        // Stop at first function whose return value causes a true result from evaluating %test

        if( strstr(%test, ";") == -1 ) // allow for optional default $= test
            %t = (%test $= %retval);
        else // string is a statement, so replace any placeholders and evaluate it
            eval("%t=" @ strreplace(%test, "%1", "\"" @ expandEscape(%retval) @ "\""));

        if( %t )
        {
            // set number of functions that returned
            %this.returnCount[%trigger_name] = %i;
            return %i;
        }

        // Reprocess this index (%i) if callback function detached itself (and a new function replaced it at this index)
        if(%this.indexBeingTriggered)
            %i++;
    }

    // set number of functions that returned -- should be all of them if we've made it this far
    %this.returnCount[%trigger_name] = %this.count[%trigger_name];
    return false;
}


// return the number of functions attached to a trigger,
// or the number of triggers that exist if no trigger name is specified
function callback::count(%this, %trigger_name)
{
    if(%trigger_name $= "")
        return %this.triggerCount;
    else
    	return %this.count[%trigger_name];
}


// check to see if a specific return value was among the values returned
// by the functions attached to a trigger
//
// %test is a statement that will evaluate to either true or false, where %1 is used
// to represent the value returned by each function. Example: "%1 > 5;"
function callback::returned(%this, %trigger_name, %test)
{
    if( strstr(%test,"%1") == -1 )
        %test = %test @ " $= %1;";

    for( %i = 1; %i <= %this.returnCount[%trigger_name]; %i++)
    {
        eval("%t=" @ strreplace(%test, "%1", "\"" @ expandEscape(%this.returnValue[%trigger_name, %i]) @ "\""));
        if( %t )
            return true; // match found
    }
    return false; // match not found
}


// count how many functions attached to an event returned a specific return value
//
// %test is a statement that will evaluate to either true or false, where %1 is used
// to represent the value returned by each function. Example: "%1 > 5;"
function callback::countMatchingReturns(%this, %test)
{
    if( strstr(%test,"%1") == -1 )
        %test = %test @ " $= %1;";

    %found = 0;
    for( %i = 1; %i <= %this.returnCount[%trigger_name]; %i++)
    {
        eval("%t=" @ strreplace(%test, "%1", "\"" @ expandEscape(%this.returnValue[%trigger_name, %i]) @ "\""));
        if( %t )
            %found++; // another match found
    }
    return %found; // return number of matching return values
}

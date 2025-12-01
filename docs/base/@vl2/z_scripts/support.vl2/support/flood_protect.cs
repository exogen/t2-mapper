// #name = Flood Protect
// #version = 1.0
// #date = March 31, 2002
// #category = Support
// #author = Paul Tousignant
// #warrior = UberGuy (FT)
// #email = uberguy@tribalwar.com
// #web = http://scripts.tribalwar.com/uberguy
// #web = http://scripts.tribes-universe.com/uberguy
// #description = Utility to help scripters prevent spam and other over-repetive events in their scripts.
// #status = Release


// Synopsis: floodProtect(%name, %duration)
//
// The single function in this script works quite simply:
//
// floodProtect("foo",1000);
//
// will return false unless the same call was made less than one second ago.
// Basically, the 1st time you call it with any string in the %name argument,
// the function starts a timer linked to that string. Until the timer expires
// (set in milliseconds with the %duration argument), the function will return
// true. If the timer has expired, it will return false and restart the timer.
//
// You can use this to prevent things from occuring except at intervals you desire.
// A common use would be to prevent a script from saying things in chat more than
// every so-many seconds.
//
// Example:
// if (!floodProtect("youShotMeMessage",5000))
//      commandToServer('TeamMessageSent',"Watch where you're shooting!");

function floodProtect(%name, %duration) {

	if(%name $= "") return false;
	if(!%duration) return false;

	%obj = "_FP_" @ %name;

	if(isObject(%obj)) return true;
	else {
		new ScriptObject(%obj) {
			class = floodProtect;
		};
	}

	%obj.duration = %duration;
	%obj.schedID = %obj.schedule(%duration, delete);
	return false;
}
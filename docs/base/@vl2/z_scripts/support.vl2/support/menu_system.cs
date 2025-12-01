// #name = Menu System
// #version = 1.02
// #date = 1/5/2002 4:50PM
// #status = release
// #author = |Rx|Diogenes
// #warrior = Diogenes
// #email = diogenes@tribalpharmacy.com
// #web = http://dioscripts.tribes-universe.com
// #description = CenterPrint Menus just like T1 Stripped. This script is a T2 port of MrPoop's original MenuSystem.cs
// #category = Support
// #credit = MrPoop

//Menu System
//Using and abusing the remmoteCP function to bend it to my will - AND - to create my own menu system

//
// So here's the quick and dirty for using this support script:
//
// A menu starts off by using the MS::NewMenu(%menuName) function, that same function can also
// be used to reset a menu. From there you will add options to it using the
// MS::AddChoice(%menuName, %key, %title, %function) function, declaring the menu you're adding
// your choice to, the key that option will be assigned to, the displayed text for that option,
// and finally the function it will execute of the user chooses it.
//
// To call a menu you've created, simply use the MS::Display(%menuName,%lines) function with
// your menuname. The %lines input is an optional override if you want to adjust the size of the menu,
// instead of it being calculated automatically.
//


//For some strange reason T2 only defaults for centerprinting of up to 3 lines. By adding the following, we're able to expand on that (I used 30 as my number)
for(%i = 4; %i <= 31; %i++) {
	$CenterPrintSizes[%i] = $CenterPrintSizes[%i-1] +16;
}


//Create a new menu
function MS::NewMenu(%menuName) {
	//Create the new menu and be sure to overwrite any menu info that may be there.
	//This will allow you to rewrite menus on the fly if you wish to do so.
	%menuName = strreplace(%menuName, " ", "_");
	DeleteVariables("$MenSys"@%menuName@"*");
	$MenSys[%menuName] = %menuName;
}

//Add a choice to a menu
function MS::AddChoice(%menuName, %key, %title, %function) {
	%menuName = strreplace(%menuName, " ", "_");
	//If the actionMap doesnt exist, make it
	if(!isObject($MenSys[%menuname])) {
		new actionMap(%MenuName);
		%MenuName.bindCmd(keyboard0, "escape", "MS::Do();", "");
	}
	//Edit the actionMap for the menu
	%tmp = $MenSys[%menuName, Item]++;
	$MenSysFunctionNum++;
	$MenSys[%menuName, %tmp] = "<COLOR:00FF2A>"@%key@". <COLOR:FFFFFF>"@%title;
	$MenSysFunction[$MenSysFunctionNum] = %function;
	%MenuName.bindCmd(keyboard0, %key, "MS::Do("@$MenSysFunctionNum@");", "MS::Break();");
}

//Dummny break function.  This keeps from mixing up the keymaps.
function MS::Break() { }

function MS::AddMenu(%parentMenu, %key, %menuName) {
	//If the actionMap doesnt exist, make it
	%menuName = strreplace(%menuName, " ", "_");
	%parentMenu = strreplace(%parentMenu, " ", "_");
	if(!$MenSys[%parentMenu, actionMap]) {
		new actionMap(%MenuName);
		$MenSys[%parentMenu, actionMap] = "TRUE";
		%MenuName.bindCmd(keyboard0, "escape", "MS::Do();", "");
	}
	//Edit the actionMap for the menu
	%tmp = $MenSys[%parentMenu, Item]++;
	$MenSys[%parentMenu, %tmp] = "<COLOR:00FF2A>"@%key@". <COLOR:FFFFFF>"@%menuName;
	%MenuName.bindCmd(keyboard0, %key, "MS::Display("@%menuName@");", "MS::Break();");
}

function MS::Display(%menuName,%lines) {
	%menuName = strreplace(%menuName, " ", "_");
	if($MenSys[%menuName] !$= "") {
// && %menuName !$= $MenSysCurrentMenu		
		%text = "\t<JUST:LEFT><COLOR:FFFFFF><font:arial Bold:18>"@ %menuName @"\n<JUST:CENTER><font:arial:15>";
		for(%i = 1; %i <= $MenSys[%menuName, Item]; %i++) {
			%text = %text@"\t\t"@$MenSys[%menuName, %i]@"\n";
		}
		//Dio: T2 CenterPrinting doesn't really center itself on the screen. I added the following to do so.
		%x = firstWord(CenterPrintDlg.position);
		%y = (getWord(getresolution(), 1) / 2) - ($CenterPrintSizes[%i]/2) ;
                CenterPrintDlg.setposition(%x,%y);
		if(%lines){
			%i = %lines;
		}
		clientCmdCenterPrint(%text,0,%i);
		//If a current menu map is up, we need to remove it
		if($MenSysCurrentMenu !$= "" && $MenSysCurrentMenu !$= %menuName) {$MenSysCurrentMenu.pop(); }
		%MenuName.push();
		$MenSysCurrentMenu = %menuName;
	}
	else {
		echo("Invalid menu call." @ $MenSys[%menuName] @"  Menu does not exist.");
	}
}

function MS::Do(%functionNum) {
	clientCmdClearCenterPrint();
	if($MenSysCurrentMenu !$= ""){
		$MenSysCurrentMenu.pop();
	}
	$MenSysCurrentMenu = "";
	if($MenSysFunction[%functionNum] !$= ""){
		eval($MenSysFunction[%functionNum]);
	}
}

// We need to add something to catch respawns, since they screw up our action maps.
package MenuSystem {

function clientCmdSetInventoryHudClearAll(%val){
	parent::clientCmdSetInventoryHudClearAll(%val);
	MS::Do();
}

};

activatepackage(MenuSystem);
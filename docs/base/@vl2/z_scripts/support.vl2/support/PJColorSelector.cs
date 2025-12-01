// #name = Tribes 2 Color Selector
// #version = 1.0.1
// #date = June 14, 2002
// #author = Mark Dickenson ([AKA]PanamaJack)
// #email = akapanamajack@planettribes.com
// #web = http://www.planettribes.com/pj
// #description = RGB Dialog
// #acknowledgements = none
// #status = working

//
//	You can now use an RGB Dialog for setting colors of text in the game.
//
//	setRGBcolor(%variable, %function)
//
//	%variable - The variable you want the new color value stored
//
//	%function - The routine you want to execute when dialog closes
//             This is usually an update routine for updating
//             a display. (optional)
//
//	example: setRGBcolor("$mycolor", "Showmyupdate();");
//
//	In the above example the RGB Dialog will open and the Red, Green and Blue
//	sliders will be set to the color in $mycolor.
//
//	When the dialog is closed either by clicking on the CANCEL or SELECT button the
//	previous or new color values will be stored in $mycolor.  You MUST place the variable name
//	within QUOTES!
//
//	And when the dialog is closed either by clicking the CANCEL or SELECT button the
//	Showmyupdate() function is called.  You would use this to cause the RGB Dialog to update
//	a display when the dialog closes.  It is an optional argument so you can leave it off.
//
//	Example of use in a Button GUI.
//
//			new ShellBitmapButton() {
//				profile = "ShellButtonProfile";
//				horizSizing = "center";
//				vertSizing = "bottom";
//				position = "0 55";
//				extent = "130 30";
//				minExtent = "26 27";
//				command = "setRGBcolor(\"$PJColor::PopupTeam\", \"PJshowPopupTeam();\");";
//				visible = "1";
//				helpTag = "0";
//				text = "Set Team Color";
//				maxLength = "255";
//			};
//
//	The above will execute the setRGBcolor command when the button is pressed.  $PJColor::PopupTeam is the
//	HEX code color information being passed to the routine for the initial slider setup and where the
//   color codes will be stored.  The PJshowPopupTeam(); that is enclosed in quotes is the routine
//	you would like the Dialog to execute when the Select or Cancel button is clicked.
//
//   If you want to change the default colors there is a file called PJRGBColors.pj in the prefs directory.
//   Load this into any text editor and you can change all 12 of the preset colors to anything you wish.
//   The colors are standard HEX codes that are used by most web browsers.
//

if(!isObject(PJColorGlobal))
    new ScriptObject(PJColorGlobal){};

function setRGBcolor(%variable, %routine) {

     eval("PJColorGlobal.color = " @ %variable @ ";");
     PJColorGlobal.variable = %variable;

	PJMakeRGBdlg();
     PJRBGOK.command = %variable @ " = PJMakeRGB(); RGBonSleep(); " @ %routine;
     PJRGBCANCEL.command = %variable @ " = $PJOldColor; RGBonSleep(); " @ %routine;
     //PJPushDialog(PJRGBDlg, 2, 4, 7, 0, 0, 0, 1, PJSoundEffects.PJFontDlg1, PJSoundEffects.PJFontDlg2, 0, $PJPref::GeneralAnimationSpeed, 1);
     canvas.pushDialog(PJRGBDlg);

     $PJOldColor = PJColorGlobal.color;

     PJsetRGBColor();
}

function PJsetRGBColor(){

	$PJRed = HexToDecimal(getSubStr(PJColorGlobal.color, 0, 2));
	GMH_PJRedSlider.setValue ( $PJRed * 0.00390625);

	$PJGreen = HexToDecimal(getSubStr(PJColorGlobal.color, 2, 2));
	GMH_PJGreenSlider.setValue ( $PJGreen * 0.00390625);

	$PJBlue = HexToDecimal(getSubStr(PJColorGlobal.color, 4, 2));
	GMH_PJBlueSlider.setValue ( $PJBlue * 0.00390625);

}

function PJMakeRGB() {

    %color = DecimalToHex($PJRed);
    %color = %color @ DecimalToHex($PJGreen);
    %color = %color @ DecimalToHex($PJBlue);

    return %color;
}

function RGBonSleep() {

     //PJPopDialog(PJRGBDlg, 2, 4, 7, 0, 0, 0, 1, PJSoundEffects.PJRGBDlg1, PJSoundEffects.PJRGBDlg2, 0, $PJPref::GeneralAnimationSpeed, 1);
     canvas.popDialog(PJRGBDlg);
}

function PJRGBDlg::onWake(%this){


}

function PJRGBDlg::onSleep(%this){

     PJRGBDlg.schedule(2000, delete);
}

$PJHex = "0123456789ABCDEF";

function HexToDecimal(%hex) {

    %hex = strupr(%hex);

    %number = StrStr($PJHex, getSubStr(%hex, 0, 1)) * 16;
    %number = %number + StrStr($PJHex, getSubStr(%hex, 1, 1));

    return %number;
}

function DecimalToHex(%decimal) {

    %hex1 = mfloor(%decimal / 16);
    %hex2 = %decimal - (%hex1 * 16);

    %hex = getSubStr($PJHex, %hex1, 1) @ getSubStr($PJHex, %hex2, 1);

    return %hex;

}

function setPJRedColor() {

	$PJRed = mfloor(GMH_PJRedSlider.getValue() * 256);
    %color = PJMakeRGB();
	PJ_RGBShowMe.setText("<just:center><color:" @ %color @">** Current Color **");

}

function setPJGreenColor() {

	$PJGreen = mfloor(GMH_PJGreenSlider.getValue() * 256);
    %color = PJMakeRGB();
	PJ_RGBShowMe.setText("<just:center><color:" @ %color @">** Current Color **");

}

function setPJBlueColor() {

	$PJBlue = mfloor(GMH_PJBlueSlider.getValue() * 256);
    %color = PJMakeRGB();
	PJ_RGBShowMe.setText("<just:center><color:" @ %color @">** Current Color **");

}

function PJMakeRGBdlg() {

new GuiControlProfile ("GuiRGBProfile"){
	fontType = "Univers Condensed Bold";
	fontSize = 28;
	fontColor = "169 215 250";
};

//--- OBJECT WRITE BEGIN ---
new GuiControl(PJRGBDlg) {
	profile = "DlgBackProfile";
	horizSizing = "right";
	vertSizing = "bottom";
	position = "0 0";
	extent = "640 480";
	minExtent = "8 8";
	visible = "1";
	hideCursor = "0";
	bypassHideCursor = "0";
	helpTag = "0";

	new ShellPaneCtrl() {
		profile = "ShellDlgPaneProfile";
		horizSizing = "center";
		vertSizing = "center";
		position = "134 58";
		extent = "372 364";
		minExtent = "48 92";
		visible = "1";
		hideCursor = "0";
		bypassHideCursor = "0";
		helpTag = "0";
		text = "Select Color";
		longTextBuffer = "0";
		maxLength = "255";
		noTitleBar = "0";

		new ShellBitmapButton(PJRGBCANCEL) {
			profile = "ShellButtonProfile";
			horizSizing = "right";
			vertSizing = "top";
			position = "57 304";
			extent = "128 38";
			minExtent = "32 38";
			visible = "1";
			hideCursor = "0";
			bypassHideCursor = "0";
			command = "";
			helpTag = "0";
			text = "Cancel";
			simpleStyle = "0";
		};
		new GuiTextCtrl() {
			profile = "ShellTextCenterProfile";
			horizSizing = "right";
			vertSizing = "bottom";
			position = "25 60";
			extent = "320 22";
			minExtent = "8 8";
			visible = "1";
			hideCursor = "0";
			bypassHideCursor = "0";
			helpTag = "0";
			text = "Red";
			longTextBuffer = "0";
			maxLength = "255";
		};
		new ShellSliderCtrl(GMH_PJRedSlider) {
			profile = "ShellSliderProfile";
			horizSizing = "right";
			vertSizing = "bottom";
			position = "27 75";
			extent = "320 24";
			minExtent = "12 24";
			visible = "1";
			hideCursor = "0";
			bypassHideCursor = "0";
			variable = "value";
			altCommand = "setPJRedColor();";
			helpTag = "0";
			range = "0.000000 0.996094";
			ticks = "256";
			value = "0.996094";
			usePlusMinus = "1";
		};
		new GuiTextCtrl() {
			profile = "ShellTextCenterProfile";
			horizSizing = "right";
			vertSizing = "bottom";
			position = "25 95";
			extent = "320 22";
			minExtent = "8 8";
			visible = "1";
			hideCursor = "0";
			bypassHideCursor = "0";
			helpTag = "0";
			text = "Green";
			longTextBuffer = "0";
			maxLength = "255";
		};
		new ShellSliderCtrl(GMH_PJGreenSlider) {
			profile = "ShellSliderProfile";
			horizSizing = "right";
			vertSizing = "bottom";
			position = "27 110";
			extent = "320 24";
			minExtent = "12 24";
			visible = "1";
			hideCursor = "0";
			bypassHideCursor = "0";
			variable = "value";
			altCommand = "setPJGreenColor();";
			helpTag = "0";
			range = "0.000000 0.996094";
			ticks = "256";
			value = "0";
			usePlusMinus = "1";
		};
		new GuiTextCtrl() {
			profile = "ShellTextCenterProfile";
			horizSizing = "right";
			vertSizing = "bottom";
			position = "25 130";
			extent = "320 22";
			minExtent = "8 8";
			visible = "1";
			hideCursor = "0";
			bypassHideCursor = "0";
			helpTag = "0";
			text = "Blue";
			longTextBuffer = "0";
			maxLength = "255";
		};
		new ShellSliderCtrl(GMH_PJBlueSlider) {
			profile = "ShellSliderProfile";
			horizSizing = "right";
			vertSizing = "bottom";
			position = "27 145";
			extent = "320 24";
			minExtent = "12 24";
			visible = "1";
			hideCursor = "0";
			bypassHideCursor = "0";
			variable = "value";
			altCommand = "setPJBlueColor();";
			helpTag = "0";
			range = "0.000000 0.996094";
			ticks = "256";
			value = "0";
			usePlusMinus = "1";
		};
		new GuiMLTextCtrl(rgb1) {
			profile = "GuiRGBProfile";
			horizSizing = "center";
			vertSizing = "top";
			position = "40 171";
			extent = "23 28";
			minExtent = "8 8";
			visible = "1";
			hideCursor = "0";
			bypassHideCursor = "0";
			helpTag = "0";
			lineSpacing = "2";
			allowColorChars = "0";
			maxChars = "-1";
			deniedSound = "InputDeniedSound";
		};
		new ShellRadioButton(rgb1a) {
			profile = "ShellRadioProfile";
			horizSizing = "right";
			vertSizing = "top";
			position = "67 171";
			extent = "35 30";
			minExtent = "26 27";
			visible = "1";
			hideCursor = "0";
			bypassHideCursor = "0";
			command = "PJColorGlobal.color = \"000000\";";
			helpTag = "0";
			longTextBuffer = "0";
			maxLength = "255";
			groupNum = "1";
		};
		new GuiMLTextCtrl(rgb2) {
			profile = "GuiRGBProfile";
			horizSizing = "right";
			vertSizing = "top";
			position = "240 204";
			extent = "23 16";
			minExtent = "8 8";
			visible = "1";
			hideCursor = "0";
			bypassHideCursor = "0";
			helpTag = "0";
			lineSpacing = "2";
			allowColorChars = "0";
			maxChars = "-1";
			deniedSound = "InputDeniedSound";
		};
		new ShellRadioButton(rgb2a) {
			profile = "ShellRadioProfile";
			horizSizing = "right";
			vertSizing = "top";
			position = "272 204";
			extent = "35 30";
			minExtent = "26 27";
			visible = "1";
			hideCursor = "0";
			bypassHideCursor = "0";
			command = "PJColorGlobal.color = \"333333\";";
			helpTag = "0";
			longTextBuffer = "0";
			maxLength = "255";
			groupNum = "1";
		};
		new GuiMLTextCtrl(rgb3) {
			profile = "GuiRGBProfile";
			horizSizing = "right";
			vertSizing = "top";
			position = "240 238";
			extent = "23 28";
			minExtent = "8 8";
			visible = "1";
			hideCursor = "0";
			bypassHideCursor = "0";
			helpTag = "0";
			lineSpacing = "2";
			allowColorChars = "0";
			maxChars = "-1";
			deniedSound = "InputDeniedSound";
		};
		new ShellRadioButton(rgb3a) {
			profile = "ShellRadioProfile";
			horizSizing = "right";
			vertSizing = "top";
			position = "272 238";
			extent = "35 30";
			minExtent = "26 27";
			visible = "1";
			hideCursor = "0";
			bypassHideCursor = "0";
			command = "PJColorGlobal.color = \"666666\";";
			helpTag = "0";
			longTextBuffer = "0";
			maxLength = "255";
			groupNum = "1";
		};
		new GuiMLTextCtrl(rgb4) {
			profile = "GuiRGBProfile";
			horizSizing = "right";
			vertSizing = "top";
			position = "240 272";
			extent = "23 28";
			minExtent = "8 8";
			visible = "1";
			hideCursor = "0";
			bypassHideCursor = "0";
			helpTag = "0";
			lineSpacing = "2";
			allowColorChars = "0";
			maxChars = "-1";
			deniedSound = "InputDeniedSound";
		};
		new ShellRadioButton(rgb4a) {
			profile = "ShellRadioProfile";
			horizSizing = "right";
			vertSizing = "top";
			position = "272 272";
			extent = "35 30";
			minExtent = "26 27";
			visible = "1";
			hideCursor = "0";
			bypassHideCursor = "0";
			command = "PJColorGlobal.color = \"999999\";";
			helpTag = "0";
			longTextBuffer = "0";
			maxLength = "255";
			groupNum = "1";
		};
		new GuiMLTextCtrl(rgb5) {
			profile = "GuiRGBProfile";
			horizSizing = "right";
			vertSizing = "top";
			position = "140 171";
			extent = "23 28";
			minExtent = "8 8";
			visible = "1";
			hideCursor = "0";
			bypassHideCursor = "0";
			helpTag = "0";
			lineSpacing = "2";
			allowColorChars = "0";
			maxChars = "-1";
			deniedSound = "InputDeniedSound";
		};
		new ShellRadioButton(rgb5a) {
			profile = "ShellRadioProfile";
			horizSizing = "right";
			vertSizing = "top";
			position = "168 171";
			extent = "35 30";
			minExtent = "26 27";
			visible = "1";
			hideCursor = "0";
			bypassHideCursor = "0";
			command = "PJColorGlobal.color = \"CCCCCC\";";
			helpTag = "0";
			longTextBuffer = "0";
			maxLength = "255";
			groupNum = "1";
		};
		new GuiMLTextCtrl(rgb6) {
			profile = "GuiRGBProfile";
			horizSizing = "right";
			vertSizing = "top";
			position = "140 204";
			extent = "23 28";
			minExtent = "8 8";
			visible = "1";
			hideCursor = "0";
			bypassHideCursor = "0";
			helpTag = "0";
			lineSpacing = "2";
			allowColorChars = "0";
			maxChars = "-1";
			deniedSound = "InputDeniedSound";
		};
		new ShellRadioButton(rgb6a) {
			profile = "ShellRadioProfile";
			horizSizing = "right";
			vertSizing = "top";
			position = "168 204";
			extent = "35 30";
			minExtent = "26 27";
			visible = "1";
			hideCursor = "0";
			bypassHideCursor = "0";
			command = "PJColorGlobal.color = \"FFFFFF\";";
			helpTag = "0";
			longTextBuffer = "0";
			maxLength = "255";
			groupNum = "1";
		};
		new GuiMLTextCtrl(rgb7) {
			profile = "GuiRGBProfile";
			horizSizing = "right";
			vertSizing = "top";
			position = "140 238";
			extent = "23 28";
			minExtent = "8 8";
			visible = "1";
			hideCursor = "0";
			bypassHideCursor = "0";
			helpTag = "0";
			lineSpacing = "2";
			allowColorChars = "0";
			maxChars = "-1";
			deniedSound = "InputDeniedSound";
		};
		new ShellRadioButton(rgb7a) {
			profile = "ShellRadioProfile";
			horizSizing = "right";
			vertSizing = "top";
			position = "168 238";
			extent = "35 30";
			minExtent = "26 27";
			visible = "1";
			hideCursor = "0";
			bypassHideCursor = "0";
			command = "PJColorGlobal.color = \"FF0000\";";
			helpTag = "0";
			longTextBuffer = "0";
			maxLength = "255";
			groupNum = "1";
		};
		new GuiMLTextCtrl(rgb8) {
			profile = "GuiRGBProfile";
			horizSizing = "right";
			vertSizing = "top";
			position = "140 272";
			extent = "23 28";
			minExtent = "8 8";
			visible = "1";
			hideCursor = "0";
			bypassHideCursor = "0";
			helpTag = "0";
			lineSpacing = "2";
			allowColorChars = "0";
			maxChars = "-1";
			deniedSound = "InputDeniedSound";
		};
		new ShellRadioButton(rgb8a) {
			profile = "ShellRadioProfile";
			horizSizing = "right";
			vertSizing = "top";
			position = "168 272";
			extent = "35 30";
			minExtent = "26 27";
			visible = "1";
			hideCursor = "0";
			bypassHideCursor = "0";
			command = "PJColorGlobal.color = \"00FF00\";";
			helpTag = "0";
			longTextBuffer = "0";
			maxLength = "255";
			groupNum = "1";
		};
		new GuiMLTextCtrl(rgb9) {
			profile = "GuiRGBProfile";
			horizSizing = "right";
			vertSizing = "top";
			position = "240 171";
			extent = "23 28";
			minExtent = "8 8";
			visible = "1";
			hideCursor = "0";
			bypassHideCursor = "0";
			helpTag = "0";
			lineSpacing = "2";
			allowColorChars = "0";
			maxChars = "-1";
			deniedSound = "InputDeniedSound";
		};
		new ShellRadioButton(rgb9a) {
			profile = "ShellRadioProfile";
			horizSizing = "right";
			vertSizing = "top";
			position = "272 171";
			extent = "35 30";
			minExtent = "26 27";
			visible = "1";
			hideCursor = "0";
			bypassHideCursor = "0";
			command = "PJColorGlobal.color = \"0000FF\";";
			helpTag = "0";
			longTextBuffer = "0";
			maxLength = "255";
			groupNum = "1";
		};
		new GuiMLTextCtrl(rgb10) {
			profile = "GuiRGBProfile";
			horizSizing = "right";
			vertSizing = "top";
			position = "40 204";
			extent = "23 28";
			minExtent = "8 8";
			visible = "1";
			hideCursor = "0";
			bypassHideCursor = "0";
			helpTag = "0";
			lineSpacing = "2";
			allowColorChars = "0";
			maxChars = "-1";
			deniedSound = "InputDeniedSound";
		};
		new ShellRadioButton(rgb10a) {
			profile = "ShellRadioProfile";
			horizSizing = "right";
			vertSizing = "top";
			position = "67 204";
			extent = "35 30";
			minExtent = "26 27";
			visible = "1";
			hideCursor = "0";
			bypassHideCursor = "0";
			command = "PJColorGlobal.color = \"FFFF00\";";
			helpTag = "0";
			longTextBuffer = "0";
			maxLength = "255";
			groupNum = "1";
		};
		new GuiMLTextCtrl(rgb11) {
			profile = "GuiRGBProfile";
			horizSizing = "right";
			vertSizing = "top";
			position = "40 238";
			extent = "23 28";
			minExtent = "8 8";
			visible = "1";
			hideCursor = "0";
			bypassHideCursor = "0";
			helpTag = "0";
			lineSpacing = "2";
			allowColorChars = "0";
			maxChars = "-1";
			deniedSound = "InputDeniedSound";
		};
		new ShellRadioButton(rgb11a) {
			profile = "ShellRadioProfile";
			horizSizing = "right";
			vertSizing = "top";
			position = "67 238";
			extent = "35 30";
			minExtent = "26 27";
			visible = "1";
			hideCursor = "0";
			bypassHideCursor = "0";
			command = "PJColorGlobal.color = \"00FFFF\";";
			helpTag = "0";
			longTextBuffer = "0";
			maxLength = "255";
			groupNum = "1";
		};
		new GuiMLTextCtrl(rgb12) {
			profile = "GuiRGBProfile";
			horizSizing = "right";
			vertSizing = "top";
			position = "40 272";
			extent = "23 28";
			minExtent = "8 8";
			visible = "1";
			hideCursor = "0";
			bypassHideCursor = "0";
			helpTag = "0";
			lineSpacing = "2";
			allowColorChars = "0";
			maxChars = "-1";
			deniedSound = "InputDeniedSound";
		};
		new ShellRadioButton(rgb12a) {
			profile = "ShellRadioProfile";
			horizSizing = "right";
			vertSizing = "top";
			position = "67 272";
			extent = "35 30";
			minExtent = "26 27";
			visible = "1";
			hideCursor = "0";
			bypassHideCursor = "0";
			command = "PJColorGlobal.color = \"FF00FF\";";
			helpTag = "0";
			longTextBuffer = "0";
			maxLength = "255";
			groupNum = "1";
		};
		new ShellBitmapButton(PJRBGOK) {
			profile = "ShellButtonProfile";
			horizSizing = "right";
			vertSizing = "top";
			position = "194 304";
			extent = "128 38";
			minExtent = "32 38";
			visible = "1";
			hideCursor = "0";
			bypassHideCursor = "0";
			command = "";
			helpTag = "0";
			text = "Select";
			simpleStyle = "0";
		};
		new GuiMLTextCtrl(PJ_RGBShowMe) {
			profile = "GuiRGBProfile";
			horizSizing = "center";
			vertSizing = "top";
			position = "87 29";
			extent = "200 28";
			minExtent = "8 8";
			visible = "1";
			hideCursor = "0";
			bypassHideCursor = "0";
			helpTag = "0";
			lineSpacing = "2";
			allowColorChars = "0";
			maxChars = "-1";
			deniedSound = "InputDeniedSound";
				text = "** Current Color **";
		};
	};
};
//--- OBJECT WRITE END ---

for (%i = 1; %i <= 12; %i++){

     %temp = rgb @ %i;
     %tempa = %temp @ a;
     %temp.setText("<color:" @ getWord($RGBColors, %i - 1) @ ">**");
     %tempa.command = "PJColorGlobal.color = \"" @ getWord($RGBColors, %i - 1) @ "\"; PJsetRGBColor();";

}

}

$RGBColors = "000000 333333 666666 999999 CCCCCC FFFFFF FF0000 00FF00 0000FF FFFF00 00FFFF FF00FF";

if(isFile("prefs/PJRGBColors.pj")){

     exec("prefs/PJRGBColors.pj");

} else {

     export("$RGBColors", "prefs/PJRGBColors.pj", false);

}

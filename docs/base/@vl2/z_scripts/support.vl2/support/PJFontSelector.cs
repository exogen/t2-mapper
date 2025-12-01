
// #name = Tribes 2 Font Selector
// #version = 1.0.1
// #date = June 14, 2002
// #author =Mark Dickenson ([AKA]PanamaJack)
// #email = akapanamajack@planettribes.com
// #web = http://www.planettribes.com/pj
// #description = Font Selector
// #acknowledgements = none
// #status = working

//
//	You can now use a Font Selector Dialog for setting the font and size of text in the game.
//
//
//   PJSelectFont(%font, %size, %function);
//
//
//	%font - The variable the font name is stored.
//
//	%size - The variable the font size is stored.
//
//	%function - The routine you want to execute when dialog closes
//       	      This is usually an update routine for updating
//     		      a display. (optional)
//
//   example: PJSelectFont("$PJPref::FlagPopupFont", "$PJPref::FlagPopupFontSize", "PJsetFlagPopupFont();");
//
//	In the above example the Font Selection Dialog will open.
//
//	When the dialog is closed either by clicking on the CANCEL or SELECT button the
//	font data is stored in the variables you indicated.  You MUST place the variable name
//	within QUOTES!  If CANCEL was selected nothing will change.
//
//	And when the dialog is closed either by clicking the CANCEL or SELECT button the
//   function is called if one has been provided in the %function variable.
//	It is an optional argument so you can leave it off.
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
//				command = "PJSelectFont(\"$PJPref::FlagPopupFont\", \"$PJPref::FlagPopupFontSize\", \"PJsetFlagPopupFont();\");";
//				visible = "1";
//				helpTag = "0";
//				text = "Set Speed Hud Font";
//				maxLength = "255";
//			};
//
//	The above will execute the PJSelectFont command when the button is pressed.  $PJPref::FlagPopupFont and
//	$PJPref::FlagPopupFontSize are the font name and sizebeing passed to the routine for the initial setup
//   and where the font and size will be stored.  The PJshowPopupTeam(); that is enclosed in quotes is the routine
//	you would like the Dialog to execute when the Select or Cancel button is clicked.

if(!isObject(PJFontGlobal))
    new ScriptObject(PJFontGlobal){};

// find installed fonts

%path = "fonts/*.gft";
for( %file = findFirstFile( %path ); %file !$= ""; %file = findNextFile( %path ) ) {
	%temp =getSubStr(%file, 6, 256);
	%location = StrStr(%temp, "_");
	%fontname = getSubStr(%temp, 0, %location);
	%temp = getSubStr(%temp, %location + 1, 256);
	%location = StrStr(%temp, ".");
	%fontsize = getSubStr(%temp, 0, %location);

	if(PJFontGlobal.FontTotal[%fontname] < 1) {
		PJFontGlobal.TotalFonts++;
		PJFontGlobal.Fontname[PJFontGlobal.TotalFonts] = %fontname;
	}

	PJFontGlobal.FontTotal[%fontname]++;
	%temp = PJFontGlobal.FontTotal[%fontname];
	PJFontGlobal.FontSize[%fontname @ %temp] = %fontsize;

}

for(%font = 1; %font <= PJFontGlobal.TotalFonts; %font++) {
	%fontname = PJFontGlobal.Fontname[%font];
	%temp = PJFontGlobal.FontTotal[%fontname];

	for (%i = 1; %i <= %temp; %i++) {
		for (%j = %i+1; %j <= %temp; %j++) {
			if (PJFontGlobal.FontSize[%fontname @ %i] > PJFontGlobal.FontSize[%fontname @ %j]) {
				%temp2 = PJFontGlobal.FontSize[%fontname @ %j];
				PJFontGlobal.FontSize[%fontname @ %j] = PJFontGlobal.FontSize[%fontname @ %i];
				PJFontGlobal.FontSize[%fontname @ %i] = %temp2;
			}
		}
	}
}

function PJselectFont(%fontvariable, %sizevariable, %routine) {

	PJMakeFontDlg();

     eval("PJFontGlobal.font = " @ %fontvariable @ ";");
     PJFontGlobal.fontvariable = %fontvariable;
     eval("PJFontGlobal.size = " @ %sizevariable @ ";");
     PJFontGlobal.sizevariable = %sizevariable;

     PJFontOK.command = "PJFontGlobal.type = 1; PJFontonSleep(); " @ %routine;
     PJFontCANCEL.command = "PJFontGlobal.type = 0; PJFontonSleep(); " @ %routine;
     //PJPushDialog(PJFontDlg, 2, 4, 7, 0, 0, 0, 1, PJSoundEffects.PJFontDlg1, PJSoundEffects.PJFontDlg2, 0, $PJPref::GeneralAnimationSpeed, 1);
     canvas.pushDialog(PJFontDlg);
     PJFontDlg.getObject(0).setVisible(1);
	PJFontText.setText("<just:center><color:00df30>Make Font and Size Selection");
	PJFontList.clear();
	for( %i = 1; %i <= PJFontGlobal.TotalFonts; %i++ ){
		PJFontList.add( PJFontGlobal.Fontname[%i], %i - 1);
          if(PJFontGlobal.font $= PJFontGlobal.Fontname[%i])
               %font = %i - 1;
     }

	PJFontList.sort(true);

//	PJFontList.sort();
	PJFontList.setSelected( %font );
	PJFontGlobal.font = PJFontGlobal.FontName[%font + 1];

	PJFontSizeList.clear();
	%fontname = PJFontGlobal.Fontname[%font + 1];
	%temp = PJFontGlobal.FontTotal[%fontname];
	for(%i1 = 1; %i1 <= %temp; %i1++) {
		PJFontSizeList.add( PJFontGlobal.FontSize[%fontname @ %i1], %i1 - 1 );
          if(PJFontGlobal.size $= PJFontGlobal.FontSize[%fontname @ %i1])
               %size = %i1 - 1;
	}

	PJFontSizeList.setSelected( %size );
	PJFontGlobal.size = PJFontGlobal.FontSize[%fontname @ %size + 1];

	PJUpdateFontDisplay();
}

function PJFontDlg::onWake(%this){


}

function PJFontDlg::onSleep(%this){

     if(PJFontGlobal.type){
          eval(PJFontGlobal.fontvariable @ " = PJFontGlobal.font;");
          eval(PJFontGlobal.sizevariable @ " = PJFontGlobal.size;");
     }
}

function PJFontList::onSelect( %this, %id, %text ) {

	PJFontGlobal.font = %text;

	PJFontSizeList.clear();
	%fontname = PJFontGlobal.Fontname[%id + 1];
	%temp = PJFontGlobal.FontTotal[%fontname];
	for(%i1 = 1; %i1 <= %temp; %i1++) {
		PJFontSizeList.add( PJFontGlobal.FontSize[%fontname @ %i1], %i1 - 1 );
	}

	PJFontSizeList.setSelected( 0 );
	PJFontGlobal.size = PJFontGlobal.FontSize[%fontname @ "1"];
	PJUpdateFontDisplay();
}

function PJFontSizeList::onSelect( %this, %id, %text ) {

	PJFontGlobal.size = %text;
	PJUpdateFontDisplay();
}

function PJfontonSleep() {

     //PJPopDialog(PJFontDlg, 2, 4, 7, 0, 0, 0, 1, PJSoundEffects.PJFontDlg1, PJSoundEffects.PJFontDlg2, 0, $PJPref::GeneralAnimationSpeed, 1);
     canvas.popDialog(PJFontDlg);
     PJFontDlg.getObject(0).setVisible(0);

     PJFontDlg.schedule(2000, 0, delete);
}

function PJUpdateFontDisplay() {

	PJFontDisplay.setValue("<just:center><font:" @ PJFontGlobal.font @ ":" @ PJFontGlobal.size @ "><color:ccdf30>1234 AaBbCcDdEe");

}

function PJMakeFontDlg() {

new GuiControlProfile ("GuiFontProfile"){
	fontType = "Univers Bold";
	fontSize = 18;
	fontColor = "169 215 250";
};

//--- OBJECT WRITE BEGIN ---
new GuiControl(PJFontDlg) {
	profile = "DlgBackProfile";
	horizSizing = "right";
	vertSizing = "bottom";
	position = "0 0";
	extent = "640 480";
	minExtent = "8 8";
	visible = "1";
	helpTag = "0";

	new ShellPaneCtrl() {
		profile = "ShellDlgPaneProfile";
		horizSizing = "center";
		vertSizing = "center";
		position = "134 64";
		extent = "372 240";
		minExtent = "48 92";
		visible = "0";
		helpTag = "0";
		text = "Set Font Selection";
		noTitleBar = "0";

		new ShellBitmapButton(PJFontCANCEL) {
			profile = "ShellButtonProfile";
			horizSizing = "right";
			vertSizing = "top";
			position = "57 175";
			extent = "128 38";
			minExtent = "32 38";
			visible = "1";
			command = "$PJSelectedFont = \"\"; $PJSelectedFontSize = \"\"; PJfontonSleep();";
			helpTag = "0";
			text = "Cancel";
			simpleStyle = "0";
		};

		new ShellPopupMenu(PJFontList) {
			profile = "ShellPopupProfile";
			horizSizing = "right";
			vertSizing = "top";
			position = "50 50";
			extent = "205 36";
			minExtent = "49 36";
			visible = "1";
			hideCursor = "0";
			bypassHideCursor = "0";
			helpTag = "0";
			text = "Font Type";
			maxLength = "255";
			maxPopupHeight = "200";
			buttonBitmap = "gui/shll_pulldown";
			rolloverBarBitmap = "gui/shll_pulldownbar_rol";
			selectedBarBitmap = "gui/shll_pulldownbar_act";
			noButtonStyle = "0";
		};

		new ShellPopupMenu(PJFontSizeList) {
			profile = "ShellPopupProfile";
			horizSizing = "right";
			vertSizing = "top";
			position = "265 50";
			extent = "65 36";
			minExtent = "49 36";
			visible = "1";
			hideCursor = "0";
			bypassHideCursor = "0";
			helpTag = "0";
			text = "Font Size";
			maxLength = "255";
			maxPopupHeight = "200";
			buttonBitmap = "gui/shll_pulldown";
			rolloverBarBitmap = "gui/shll_pulldownbar_rol";
			selectedBarBitmap = "gui/shll_pulldownbar_act";
			noButtonStyle = "0";
		};

		new ShellFieldCtrl() {
			profile = "ShellFieldProfile";
			horizSizing = "center";
			vertSizing = "top";
			position = "0 90";
			extent = "300 85";
			minExtent = "16 18";
			visible = "1";
			helpTag = "0";

			new GuiMLTextCtrl(PJFontDisplay) {
				profile = "ShellTextCenterProfile";
				horizSizing = "center";
				vertSizing = "center";
				position = "4 4";
				extent = "298 83";
				minExtent = "8 8";
				visible = "1";
				helpTag = "0";
				maxLength = "255";
			};
		};

		new ShellBitmapButton(PJFontOK) {
			profile = "ShellButtonProfile";
			horizSizing = "right";
			vertSizing = "top";
			position = "194 175";
			extent = "128 38";
			minExtent = "32 38";
			visible = "1";
			command = "PJfontonSleep();";
			helpTag = "0";
			text = "Select";
			simpleStyle = "0";
		};
		new GuiMLTextCtrl(PJFontText) {
			profile = "GuiFontProfile";
			horizSizing = "center";
			vertSizing = "top";
			position = "179 35";
			extent = "250 22";
			minExtent = "8 8";
			visible = "1";
			helpTag = "0";
		};
	};
};
//--- OBJECT WRITE END ---
}


$PJSelectedFont1 = "univers condensed";
$PJSelectedFontSize1 = "16";


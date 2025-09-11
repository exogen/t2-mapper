
//--------------------------------------------------------------------------
//-------------------------------------- Cursors
//
new GuiCursor(DefaultCursor)
{
   hotSpot = "1 1";
   bitmapName = "gui/CUR_3darrow";
};

new GuiCursor(ArrowNoCursor)
{
   hotSpot = "1 1";
   bitmapName = "gui/CUR_3darrowno";
};

new GuiCursor(ArrowWaitCursor)
{
   hotSpot = "1 1";
   bitmapName = "gui/CUR_3darrowwait";
};

new GuiCursor(ArrowHelpCursor)
{
   hotSpot = "1 1";
   bitmapName = "gui/CUR_3darrowhelp";
};

new GuiCursor(MoveCursor)
{
   hotSpot = "11 11";
   bitmapName = "gui/CUR_3dmove";
};

new GuiCursor(UpDownCursor)
{
   hotSpot = "5 10";
   bitmapName = "gui/CUR_3dupdown";
};

new GuiCursor(LeftRightCursor)
{
   hotSpot = "9 5";
   bitmapName = "gui/CUR_3dleftright";
};

new GuiCursor(DiagRightCursor)
{
   hotSpot = "8 8";
   bitmapName = "gui/CUR_3ddiagright";
};

new GuiCursor(DiagLeftCursor)
{
   hotSpot = "8 8";
   bitmapName = "gui/CUR_3ddiagleft";
};

new GuiCursor(RotateCursor)
{
   hotSpot = "11 14";
   bitmapName = "gui/CUR_rotate";
};

new GuiCursor(ResizeDownCursor)
{
   hotSpot = "4 8";
   bitmapName = "gui/CUR_3dresizeright";
};

new GuiCursor(GrabCursor)
{
   hotSpot = "9 13";
   bitmapName = "gui/CUR_Grab";
};

//--------------------------------------------------------------------------
//-------------------------------------- Profiles
//
new GuiControlProfile("GuiDialogProfile");

new GuiControlProfile("GuiModelessDialogProfile")
{
   modal = false;
};

new GuiControlProfile ("GuiContentProfile")
{
   opaque = true;
   fillColor = "255 255 255";
};

new GuiControlProfile ("clockProfile")
{
   fontType = "Univers Condensed";
   fontSize = 12;
   fontColor = "255 255 255";
};

new GuiControlProfile ("SiegeHalftimeClockProfile")
{
   fontType = "Univers Condensed";
   fontSize = 18;
   fontColor = "255 255 255";
};

new GuiControlProfile ("GuiContentProfileNoClear")
{
   opaque = false;
   fillColor = "255 255 255";
};

//--------------------------------------------------------------------------
// Base font definitions:
//--------------------------------------------------------------------------
$ShellFont = "Univers";
$ShellFontSize = 16;
$ShellMediumFontSize = 18;
$ShellHeaderFont = "Sui Generis";
$ShellHeaderFontSize = 22;
$ShellButtonFont = "Univers Condensed";
$ShellButtonFontSize = 16;
$ShellLabelFont = "Univers Condensed";
$ShellLabelFontSize = 18;
$ShellBoldFont = "Univers Bold";

$ShellColorBright = "173 255 250";
$ShellColorDark = "130 190 185";
$ShellColorVeryDark = "0 117 133";

// Color coding system for Player names in the game:
$PlayerNameColor  = "200 200 200";
$TribeTagColor    = "220 220 20";
$SmurfNameColor   = "150 150 250";
$BotNameColor     = "60 220 150";

//--------------------------------------------------------------------------
// Beginning of the "New Shell" section:
new GuiControlProfile ("ShellButtonProfile")
{
   fontType = $ShellButtonFont;
   fontSize = $ShellButtonFontSize;
   fontColor = "8 19 6";
   fontColorHL = "25 68 56";
   fontColorNA = "5 5 5";
   fontColorSEL = "25 68 56";
   fixedExtent = true;
   justify = "center";
	bitmap = "gui/shll_button";
   textOffset = "0 10";
   soundButtonDown = sButtonDown;
   soundButtonOver = sButtonOver;
   tab = true;
   canKeyFocus = true;
};

new GuiControlProfile ("ShellButtonNoTabProfile")
{
   fontType = $ShellButtonFont;
   fontSize = $ShellButtonFontSize;
   fontColor = "8 19 6";
   fontColorHL = "25 68 56";
   fontColorNA = "5 5 5";
   fontColorSEL = "25 68 56";
   fixedExtent = true;
   justify = "center";
	bitmap = "gui/shll_button";
   textOffset = "0 10";
   soundButtonDown = sButtonDown;
   soundButtonOver = sButtonOver;
   tab = false;
   canKeyFocus = true;
};

new GuiControlProfile ("ShellRadioProfile")
{
   fontType = $ShellButtonFont;
   fontSize = $ShellButtonFontSize;
   fontColor = "8 19 6";
   fontColorHL = "25 68 56";
   fontColorNA = "5 5 5";
   fixedExtent = true;
   justify = "center";
   bitmap = "gui/shll_radio";
   soundButtonDown = sButtonDown;
   soundButtonOver = sButtonOver;
   tab = true;
   canKeyFocus = true;
};

new GuiControlProfile ("ShellTabProfile")
{
   fontType = $ShellButtonFont;
   fontSize = $ShellButtonFontSize;
   fontColor = "8 19 6";
   fontColorHL = "25 68 56";
   fontColorNA = "5 5 5";
   fontColorSEL = "8 19 6";
   fixedExtent = true;
   justify = "center";
   bitmap = "gui/shll_tabbutton";
   soundButtonDown = sButtonDown;
   soundButtonOver = sButtonOver;
   tab = true;
   canKeyFocus = true;
};

new GuiControlProfile ("TabGroupProfile")
{
   fontType = $ShellButtonFont;
   fontSize = $ShellButtonFontSize;
   fontColor = "8 19 6";
   fontColorHL = "25 68 56";
   fontColorNA = "5 5 5";
   fontColorSEL = "8 19 6";
   fixedExtent = true;
   bitmapBase = "gui/shll_horztabbutton";
   justify = "center";
   textOffset = "8 0";
   soundButtonDown = sButtonDown;
   soundButtonOver = sButtonOver;
   tab = true;
   canKeyFocus = true;
};

new GuiControlProfile ("LaunchTabProfile")
{
   fontType = $ShellButtonFont;
   fontSize = $ShellButtonFontSize;
   fontColor = "60 140 140";
   fontColorHL = "6 245 215";
   fontColorNA = "64 64 64";
   fontColorSEL = "6 245 215";
   fixedExtent = true;
   bitmapBase = "gui/lnch_tab";
   justify = "center";
   textOffset = "8 0";
   soundButtonDown = sButtonDown;
   soundButtonOver = sButtonOver;
   tab = true;
   canKeyFocus = true;
};

new GuiControlProfile ("ShellTabFrameProfile")
{
	bitmapBase = "gui/shll_tabframe";
};

new GuiControlProfile ("ShellHorzTabFrameProfile")
{
	bitmapBase = "gui/shll_horztabframe";
};

new GuiControlProfile ("ShellPopupProfile")
{
   fontType = $ShellFont;
   fontSize = $ShellFontSize;
   fontColor = "8 19 6";
   fontColorHL = "25 68 56";
   fontColorNA = "5 5 5";
   fontColorSEL = "8 19 6";
   fixedExtent = true;
   justify = "center";
   soundButtonDown = sButtonDown;
   soundButtonOver = sButtonOver;
	bitmapBase = "gui/shll_scroll";
   tab = true;
   canKeyFocus = true;
};

new GuiControlProfile ("NewTextEditProfile")
{
   fillColorHL = $ShellColorDark;
   fontType = $ShellFont;
   fontSize = $ShellFontSize;
   fontColor = "60 140 140";
   fontColorHL = "25 68 56";
   fontColorNA = "128 128 128";
   cursorColor = $ShellColorBright;
   bitmap = "gui/shll_entryfield";
   textOffset = "14 0";
   autoSizeWidth = false;
   autoSizeHeight = false;
   tab = true;
   canKeyFocus = true;
};

new GuiControlProfile ("NewTextEditNumericProfile")
{
   fillColorHL = $ShellColorDark;
   fontType = $ShellFont;
   fontSize = $ShellFontSize;
   fontColor = "60 140 140";
   fontColorHL = "25 68 56";
   fontColorNA = "128 128 128";
   cursorColor = $ShellColorBright;
   bitmap = "gui/shll_entryfield";
   justify = "center";
   textOffset = "14 0";
   autoSizeWidth = false;
   autoSizeHeight = false;
   numbersOnly = true;
   tab = true;
   canKeyFocus = true;
};

new GuiControlProfile ("NewTextEditCenterProfile")
{
   fillColorHL = $ShellColorDark;
   fontType = $ShellFont;
   fontSize = $ShellFontSize;
   fontColor = "60 140 140";
   fontColorHL = "25 68 56";
   fontColorNA = "128 128 128";
   cursorColor = $ShellColorBright;
   bitmap = "gui/shll_entryfield";
   justify = "center";
   autoSizeWidth = false;
   autoSizeHeight = false;
   tab = true;
   canKeyFocus = true;
};

new GuiControlProfile ("NewScrollCtrlProfile")
{
   bitmapBase = "gui/shll_scroll";
   soundButtonDown = sButtonDown;
   soundButtonOver = sButtonOver;
};

new GuiControlProfile ("ShellFieldProfile")
{
   bitmapBase = "gui/shll_field";
};

new GuiControlProfile ("ShellSliderProfile")
{
   fontType = $ShellLabelFont;
   fontSize = $ShellFontSize;
   fontColor   = "60 180 180";
   fontColorNA = "128 128 128";
   bitmapBase = "gui/shll_scroll";
	canKeyFocus = true;
   soundButtonOver = sButtonOver;
};

new GuiControlProfile ("ShellTextArrayProfile")
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

new GuiControlProfile ("ShellActiveTextProfile")
{
   fontType = $ShellFont;
   fontSize = $ShellFontSize;
   fontColor   = "60 180 180";
   fontColorHL = "6 245 215";
   fontColorNA = "128 128 128";
   fontColorSEL = "25 68 56";
   justify = "center";
};

new GuiControlProfile ("ShellPaneProfile")
{
   fontType = $ShellHeaderFont;
   fontSize = $ShellHeaderFontSize;
   fontColor = "5 5 5";
   autoSizeWidth = false;
   autoSizeHeight = false;
	bitmapBase = "gui/shll";
};

new GuiControlProfile ("ShellDlgPaneProfile")
{
   fontType = $ShellHeaderFont;
   fontSize = $ShellHeaderFontSize;
   fontColor = "5 5 5";
   autoSizeWidth = false;
   autoSizeHeight = false;
	bitmapBase = "gui/dlg";
};

new GuiControlProfile ("ShellWindowProfile")
{
   borderColor = "3 124 134";
   fontType = $ShellHeaderFont;
   fontSize = $ShellHeaderFontSize;
   fontColor = "5 5 5";
   autoSizeWidth = false;
   autoSizeHeight = false;
	bitmapBase = "gui/dlg";
   soundButtonDown = sButtonDown;
   soundButtonOver = sButtonOver;
};

new GuiControlProfile ("ShellDlgProfile")
{
   fontType = $ShellHeaderFont;
   fontSize = $ShellHeaderFontSize;
   fontColor = "5 5 5";
	bitmap = "gui/dlg_box";
   autoSizeWidth = false;
   autoSizeHeight = false;
};

new GuiControlProfile ("BrowserH1Profile")
{
	fontType = "Univers Condensed Bold";
	fontSize = 28;
   fontColor = "40 247 113"; // green
   autoSizeWidth = false;
   autoSizeHeight = true;
   bitmapBase = "gui/shll";
};

new GuiControlProfile ("CloseButtonProfile")
{
	bitmap = "gui/shll_menuclose";
   soundButtonDown = sButtonDown;
   soundButtonOver = sButtonOver;
   tab = true;
   canKeyFocus = true;
};

new GuiControlProfile ("SoundTestButtonProfile")
{
	bitmap = "gui/shll_soundbutton";
   soundButtonOver = sButtonOver;
   tab = true;
   canKeyFocus = true;
};

new GuiControlProfile ("LaunchMenuProfile")
{
   fontType = $ShellFont;
   fontSize = $ShellFontSize;
   fontColor = "6 245 215";
   fontColorHL = "74 251 228";
   fontColorSEL = "4 41 45";
   borderColor = "84 121 125 200";
   fixedExtent = true;
   justify = "center";
   bitmapBase = "gui/launch_btn";
   textOffset = "0 19";
   soundButtonDown = sLaunchMenuOpen;
   soundButtonOver = sLaunchMenuOver;
   tab = true;
   canKeyFocus = true;
};

new GuiControlProfile ("LaunchBtnTopProfile")
{
   fixedExtent = true;
   bitmapBase = "gui/launchtop_btn";
};

new GuiControlProfile ("ShellServerBrowserProfile")
{
   fontType = $ShellFont;
   fontSize = $ShellFontSize;
   fontColor   = "60 180 180";
   fontColorHL = "6 245 215";
   fontColorNA = "128 128 128";
   fontColorSEL = "25 68 56";
   fontColors[4] = "20 167 93";     // Mod base color
   fontColors[5] = "40 217 113";    // Mod rollover color
   fontColors[6] = "5 60 30";       // Mod selected color
   fontColors[7] = "108 108 108";   // Differing build base color       
   fontColors[8] = "168 168 168";   // Differing build rollover color
   fontColors[9] = "58 58 58";      // Differing build selected color
   bitmapBase = "gui/shll_scroll";
   soundButtonDown = sButtonDown;
   soundButtonOver = sButtonOver;
	tab = true;
	canKeyFocus = true;
};

new GuiControlProfile ("ShellBrowserListProfile")
{
   fontType = $ShellFont;
   fontSize = 12;
   fontColor = "20 220 20";
   fontColorHL = "60 250 60";
   fontColorNA = "128 128 128";
   fontColorSEL = "0 60 0";
   soundButtonDown = sButtonDown;
   soundButtonOver = sButtonOver;
   tab = true;
   canKeyFocus = true;
};

new GuiControlProfile ("LobbyPlayerListProfile")
{
   fontType = $ShellFont;
   fontSize = $ShellFontSize;
   fontColor   = "60 180 180";
   fontColorHL = "6 245 215";
   fontColorNA = "128 128 128";
   fontColorSEL = "25 68 56";
   fontColors[6] = $PlayerNameColor;
   fontColors[7] = $TribeTagColor;  
   fontColors[8] = $SmurfNameColor; 
   fontColors[9] = $BotNameColor;   
   bitmapBase = "gui/shll_scroll";
   soundButtonDown = sButtonDown;
   soundButtonOver = sButtonOver;
	tab = true;
	canKeyFocus = true;
};

new GuiControlProfile ("ShellBrowserTitleProfile")
{
   fontType = "Sui Generis";
   fontSize = 32;
   fontColor = "173 255 250";
   autoSizeWidth = true;
   autoSizeHeight = true;
   tab = false;
   canKeyFocus = false;
};
//--------------------------------------------------------------------------
// End of "New Shell" section.

new GuiControlProfile ("ShellHoloButtonProfile")
{
   opaque = true;
   fillColor = $ShellColorVeryDark;
   fillColorNA = "128 128 128";
   border = true;
   borderColor   = $ShellColorBright;
   borderColorHL = "127 127 127";
   borderColorNA = "192 192 192";
   fontType = "Univers";
   fontSize = 14;
   fontColor = $ShellColorBright;
   fontColorHL = $ShellColorDark;
   fontColorNA = "192 192 192";
   fixedExtent = true;
   justify = "center";
   soundButtonDown = sButtonDown;
   soundButtonOver = sButtonOver;
   tab = true;
   canKeyFocus = true;
};

new GuiControlProfile ("GameHoloButtonProfile")
{
   opaque = true;
   fillColor = "0 64 0 80";
   border = true;
   borderColor   = "0 255 0";
   borderColorHL = "127 127 127";
   fontType = "Univers";
   fontSize = 14;
   fontColor = "0 255 0";
   fontColorHL = "0 128 0";
   fixedExtent = true;
   justify = "center";
   soundButtonDown = sButtonDown;
   soundButtonOver = sButtonOver;
   tab = true;
};

new GuiControlProfile ("ShellHoloBox")
{
   opaque = true;
   fillColor = "72 72 72 128";
	border = true;
	borderColor = $ShellColorBright;
};

new GuiControlProfile ("TaskHudBox")
{
   opaque = true;
   fillColor = "72 72 72 128";
	border = true;
	borderColor = "30 59 56 80";
};

new GuiControlProfile ("ShellOpaqueBox")
{
   opaque = true;
   fillColor = $ShellColorVeryDark;
   border = true;
   borderColor = $ShellColorBright;
};

new GuiControlProfile ("ShellScrollCtrlProfile")
{
   border = true;
   borderColor = $ShellColorBright;
   bitmap = "gui/shellScroll";
};

new GuiControlProfile ("ShellTextProfile")
{
   fontType = $ShellLabelFont;
   fontSize = $ShellLabelFontSize;
   fontColor = "66 229 244";
   autoSizeWidth = true;
   autoSizeHeight = true;
};

new GuiControlProfile ("ShellTextRightProfile")
{
   fontType = $ShellLabelFont;
   fontSize = $ShellLabelFontSize;
   fontColor = "66 229 244";
   justify = "right";
   autoSizeWidth = false;
   autoSizeHeight = true;
};

new GuiControlProfile ("ShellTextCenterProfile")
{
   fontType = $ShellLabelFont;
   fontSize = $ShellLabelFontSize;
   fontColor = "66 229 244";
   justify = "center";
   autoSizeWidth = false;
   autoSizeHeight = true;
};

new GuiControlProfile ("DisabledTextProfile")
{
   fontType = $ShellLabelFont;
   fontSize = $ShellLabelFontSize;
   fontColor = "128 128 128";
   autoSizeWidth = true;
   autoSizeHeight = true;
};

new GuiControlProfile ("DisabledTextRightProfile")
{
   fontType = $ShellLabelFont;
   fontSize = $ShellLabelFontSize;
   fontColor = "128 128 128";
   justify = "right";
   autoSizeWidth = false;
   autoSizeHeight = true;
};

new GuiControlProfile ("ShellAltTextProfile")
{
   fontType = $ShellFont;
   fontSize = $ShellFontSize;
   fontColor = "66 219 234";
   autoSizeWidth = true;
   autoSizeHeight = true;
};

new GuiControlProfile ("ShellAltTextRightProfile")
{
   fontType = $ShellFont;
   fontSize = $ShellFontSize;
   fontColor = "66 219 234";
   justify = "right";
   autoSizeWidth = false;
   autoSizeHeight = true;
};

new GuiControlProfile ("ShellAltTextCenterProfile")
{
   fontType = $ShellFont;
   fontSize = $ShellFontSize;
   fontColor = "66 219 234";
   justify = "center";
   autoSizeWidth = false;
   autoSizeHeight = true;
};

new GuiControlProfile ("ShellStaticTextProfile")
{
   fontType = $ShellFont;
   fontSize = $ShellFontSize;
   fontColor = "66 219 234";
   autoSizeWidth = false;
   autoSizeHeight = true;
};

new GuiControlProfile ("VersionTextProfile")
{
   fontType = "Univers Bold";
   fontSize = $ShellMediumFontSize;
   fontColor = "0 0 0";
   justify = "right";
   autoSizeWidth = false;
   autoSizeHeight = true;
};

new GuiControlProfile ("CenterPrintTextProfile")
{
   fontType = $ShellFont;
   fontSize = $ShellMediumFontSize;
   fontColor = $ShellColorBright;
   autoSizeWidth = false;
   autoSizeHeight = true;
};


new GuiControlProfile ("ShellEditMOTDTextProfile")
{
   fontType = $ShellFont;
   fontSize = $ShellFontSize;
   fontColor = "66 219 234";
   fontColorHL = "25 68 56";
   fillColorHL = "50 233 206";
   cursorColor = "200 240 240";
   autoSizeWidth = false;
   autoSizeHeight = false;
   tab = true;
   canKeyFocus = true;
};

new GuiControlProfile ("ShellTopicTextProfile")
{
   fontType = $ShellFont;
   fontSize = $ShellMediumFontSize;
   fontColor = "100 200 200";
   autoSizeWidth = false;
   autoSizeHeight = true;
};

new GuiControlProfile ("BrowserFilterLabelProfile")
{
   fontType = $ShellLabelFont;
   fontSize = 22;
   fontColor = "0 220 0";
   justify = "left";
   autoSizeWidth = true;
   autoSizeHeight = true;
};

new GuiControlProfile ("BrowserFilterTextProfile")
{
   fontType = $ShellLabelFont;
   fontSize = 22;
   fontColor = "66 219 234";
   justify = "left";
   autoSizeWidth = true;
   autoSizeHeight = true;
};

new GuiControlProfile ("BrowserStatusTextProfile")
{
   fontType = $ShellLabelFont;
   fontSize = 22;
   fontColor = "66 219 234";
   justify = "right";
   autoSizeWidth = false;
   autoSizeHeight = true;
};

new GuiControlProfile ("BrowserProgressProfile")
{
   opaque = false;
   fillColor = "79 253 181 180";
   border = true;
   borderColor   = "3 124 134";
};

new GuiControlProfile ("InfoWindowProfile")
{
   fontType = $ShellFont;
   fontSize = $ShellFontSize;
   fontColor = "66 219 234";
   fontColors[6] = $PlayerNameColor;
   fontColors[7] = $TribeTagColor;  
   fontColors[8] = $SmurfNameColor; 
   fontColors[9] = $BotNameColor;   
   autoSizeWidth = true;
   autoSizeHeight = true;
};

new GuiControlProfile ("ShellMessageTextProfile")
{
   fontType = $ShellFont;
   fontSize = $ShellMediumFontSize;
   fontColor = "66 219 234";
   fontColorHL = "25 68 56";
   fillColorHL = "50 233 206";
   cursorColor = "200 240 240";
   autoSizeWidth = false;
   autoSizeHeight = false;
   tab = true;
   canKeyFocus = true;
};

new GuiControlProfile ("ShellLoadTextProfile")
{
   fontType = $ShellFont;
   fontSize = $ShellMediumFontSize;
   fontColor = "66 219 234";
   autoSizeWidth = true;
   autoSizeHeight = true;
};

new GuiControlProfile ("ShellLargeLabelProfile" )
{
   fontType = $ShellLabelFont;
   fontSize = 22;
   fontColor = "60 180 180";
   autoSizeWidth = false;
   autoSizeHeight = true;
};

new GuiControlProfile ("ShellMediumTextProfile")
{
   fontType = $ShellFont;
   fontSize = $ShellMediumFontSize;
   fontColor = $ShellColorBright;
   autoSizeWidth = true;
   autoSizeHeight = true;
};

new GuiControlProfile ("ShellMediumTextCenterProfile")
{
   fontType = $ShellFont;
   fontSize = $ShellMediumFontSize;
   fontColor = $ShellColorBright;
   autoSizeWidth = false;
   autoSizeHeight = true;
   justify = "center";
};

new GuiControlProfile ("DebriefHeadlineTextProfile")
{
   fontType = $ShellLabelFont;
   fontSize = 28;
   fontColor = $ShellColorBright;
   autoSizeWidth = false;
   autoSizeHeight = true;
   tab = false;
   canKeyFocus = false;
};

new GuiControlProfile ("DebriefTextProfile")
{
   fontType = $ShellFont;
   fontSize = $ShellMediumFontSize;
   fontColor = "60 180 180";
   fontColors[6] = $PlayerNameColor;
   fontColors[7] = $TribeTagColor;  
   fontColors[8] = $SmurfNameColor; 
   fontColors[9] = $BotNameColor;   
   autoSizeWidth = false;
   autoSizeHeight = false;
   tab = false;
   canKeyFocus = false;
};

new GuiControlProfile ("ScoreHeaderTextProfile")
{
   fontType = $ShellLabelFont;
   fontSize = 28;
   fontColor = "0 255 255";
   autoSizeWidth = false;
   autoSizeHeight = true;
   tab = false;
   canKeyFocus = false;
};

new GuiControlProfile ("ScoreSubheaderTextProfile")
{
   fontType = $ShellLabelFont;
   fontSize = 22;
   fontColor = "0 255 255";
   autoSizeWidth = false;
   autoSizeHeight = true;
   tab = false;
   canKeyFocus = false;
};

new GuiControlProfile ("ScoreTextProfile")
{
   fontType = $ShellFont;
   fontSize = $ShellMediumFontSize;
   fontColor = "0 220 220";
   autoSizeWidth = false;
   autoSizeHeight = false;
   tab = false;
   canKeyFocus = false;
};

new GuiControlProfile ("ShellTreeViewProfile")
{
   fontType = $ShellFont;
   fontSize = $ShellFontSize;
	fontColor = "6 245 215";
	fontColorHL = "6 245 215";
   fontColorSEL = "25 68 56";
	bitmapBase = "gui/shll_bar";
   tab = true;
   canKeyFocus = true;
};

new GuiControlProfile ("ShellBigTextProfile")
{
   fontType = $ShellHeaderFont;
   fontSize = $ShellHeaderFontSize;
   fontColor = $ShellColorBright;
   autoSizeWidth = true;
   autoSizeHeight = true;
};

new GuiControlProfile ("HudScoreListProfile")
{
   fontType = $ShellFont;
   fontSize = $ShellMediumFontSize;
   fontColor   = "60 180 180";
};

new GuiControlProfile ("GuiHelpBoxProfile")
{
	border = false;
	//borderColor = "3 144 156";
   opaque = true;
   fillColor = "3 144 156 86";
};

new GuiControlProfile ("GuiHelpTextProfile")
{
   fontType = $ShellFont;
   fontSize = $ShellFontSize;
	fontColor = "169 215 250";
   autoSizeWidth = false;
   autoSizeHeight = false;
	justify = "left";
};

new GuiControlProfile ("GuiHelpHeaderProfile")
{
   fontType = $ShellLabelFont;
   fontSize = $ShellLabelFontSize;
	fontColor = "169 215 250";
   autoSizeWidth = true;
   autoSizeHeight = true;
	justify = "left";
};

new GuiControlProfile ("GuiVoiceRedProfile")
{
   fontType = $ShellFont;
   fontSize = $ShellFontSize;
   fontColor = "180 0 0";
	justify = "left";
};

new GuiControlProfile ("GuiVoiceGreenProfile")
{
   fontType = $ShellFont;
   fontSize = $ShellFontSize;
   fontColor = "0 180 0";
	justify = "left";
};

new GuiControlProfile( "GuiDeathMsgHudProfile" )
{
	opaque = false;
	border = false;
	//borderColor = "255 255 0 128";
};

new GuiControlProfile ("GuiTextProfile")
{
   fontType = "Univers";
   fontSize = 16;
   fontColor = "0 0 0";
   autoSizeWidth = true;
   autoSizeHeight = true;
};

new GuiControlProfile ("GuiCenterTextProfile")
{
   fontType = "Univers";
   fontSize = 16;
   fontColor = "0 0 0";
   fixedExtent = true;
   justify = "center";
};

new GuiControlProfile ("GuiBigTextProfile")
{
   fontType = "Times";
   fontSize = 36;
   fontColor = "0 0 0";
   autoSizeWidth = true;
   autoSizeHeight = true;
};

new GuiControlProfile ("GuiBigTextProfileWhite")
{
   fontType = "Times";
   fontSize = 24;

   fontColor   = "  0   0   0";
   fillColor   = "255 255 255";

   fontColorHL = "255 255 255";
   fillColorHL = "0 0 0";

   autoSizeWidth = true;
   autoSizeHeight = true;
   
   opaque = true;
};

new GuiControlProfile("GuiBorderProfile") 
{
	border = "true";
	borderColor = "40 205 170";
   opaque = true;
   fillColor = "0 64 100 80";
};

new GuiControlProfile("ZoomHudProfile") 
{
	border = "true";
	borderColor = "40 205 170";
   opaque = false;
   fillColor = "0 64 100 80";
};

new GuiControlProfile("GuiDashBoxProfile") 
{
	border = "false";
   opaque = false;
};

new GuiControlProfile("GuiDashTextProfile") 
{
   fontType = "Univers Condensed";
   fontSize = 16;
   fontColor = "154 208 253";
   justify = "center";
};

new GuiControlProfile ("GuiTextBGLeftProfile")
{
   fontType = "Univers Condensed";
   fontSize = 20;
   fontColor = "70 235 200";
   justify = "center";
};

new GuiControlProfile ("GuiTextBGCenterProfile")
{
   fontType = "Univers";
   fontSize = 16;
   fontColor = "70 235 200";
   justify = "center";
};

new GuiControlProfile ("GuiTextBGRightProfile")
{
   fontType = "Univers";
   fontSize = 16;
   fontColor = "70 235 200";
   justify = "right";
};

new GuiControlProfile ("GuiTextBGWhiteRightProfile")
{
   fontType = "Univers Condensed";
   fontSize = 16;
   fontColor = "90 255 220";
   justify = "right";
};

new GuiControlProfile ("GuiHelpLineProfile")
{
	borderColor = "231 101 26";
	bitmap = "gui/hud_dot";
};

new GuiControlProfile ("GuiTextObjHudCenterProfile")
{
	fontType = "Univers Condensed";
	fontSize = 16;
	fontColor = "169 215 250";
   fontColors[6] = $PlayerNameColor;
   fontColors[7] = $TribeTagColor;  
   fontColors[8] = $SmurfNameColor; 
   fontColors[9] = $BotNameColor;   
	justify = "center";
};

new GuiControlProfile ("GuiTextObjHudLeftProfile")
{
	fontType = "Univers Condensed";
	fontSize = 16;
	fontColor = "169 215 250";
   fontColors[6] = $PlayerNameColor;
   fontColors[7] = $TribeTagColor;  
   fontColors[8] = $SmurfNameColor; 
   fontColors[9] = $BotNameColor;   
	justify = "left";
};

new GuiControlProfile ("GuiTextObjGreenLeftProfile")
{
	fontType = "Univers Condensed";
	fontSize = 16;
	fontColor = "23 236 67";
   fontColors[6] = $PlayerNameColor;
   fontColors[7] = $TribeTagColor;  
   fontColors[8] = $SmurfNameColor; 
   fontColors[9] = $BotNameColor;   
	justify = "left";
};

new GuiControlProfile ("GuiTextObjGreenCenterProfile")
{
	fontType = "Univers Condensed";
	fontSize = 16;
	fontColor = "23 236 67";
   fontColors[6] = $PlayerNameColor;
   fontColors[7] = $TribeTagColor;  
   fontColors[8] = $SmurfNameColor; 
   fontColors[9] = $BotNameColor;   
	justify = "center";
};

new GuiControlProfile ("DeathMsgTextProfile")
{
   fontType = "Univers";
   fontSize = 14;
   fontColor = "40 247 113"; // green
	justify = "left";
};

new GuiControlProfile("DebuggerWindowProfile") {
	border = "true";
	borderColor = "255 255 255";
	opaque = "true";
	fillColor = "0 0 0"; 
};

new GuiControlProfile ("GuiTextEditProfile")
{
   opaque = true;
   fillColor = "255 255 255";
   fillColorHL = "128 128 128";
   border = true;
   borderColor = "0 0 0";
   fontType = "Lucida Console";
   fontSize = 12;
   fontColor = "0 0 0";
   fontColorHL = "255 255 255";
   fontColorNA = "128 128 128";
   textOffset = "0 2";
   autoSizeWidth = false;
   autoSizeHeight = true;
   tab = true;
   canKeyFocus = true;
};

new GuiControlProfile ("GuiInspectorTextEditProfile")
{
   opaque = true;
   fillColor = "255 255 255";
   fillColorHL = "128 128 128";
   border = true;
   borderColor = "0 0 0";
   fontType = "Univers";
   fontSize = 16;
   fontColor = "0 0 0";
   fontColorHL = "255 255 255";
   autoSizeWidth = false;
   autoSizeHeight = true;
   tab = false;
   canKeyFocus = true;
};

new GuiControlProfile ("GuiMessageEditHudProfile")
{
   fontType = "verdana";
   fontSize = 14;
   fontColor = "255 255 0";
   cursorColor = "255 205 0";
   autoSizeWidth = false;
   autoSizeHeight = true;
   tab = false;
   canKeyFocus = true;
};

new GuiControlProfile ("GuiMessageEditHudTextProfile")
{
   fontType = "verdana";
   fontSize = 14;
   fontColor = "255 255 255";
   autoSizeWidth = true;
   autoSizeHeight = true;
   tab = false;
};

new GuiControlProfile("GuiAmmoHudProfile")
{
   fontType = "Univers Condensed";
   fontSize = 16;
	fontColor = "169 215 250";
   autoSizeWidth = false;
   autoSizeHeight = true;
};

new GuiControlProfile("GuiPackTextProfile")
{
   fontType = "Univers";
   fontSize = 12;
	fontColor = "169 215 250";
	justify = "center";
   autoSizeWidth = false;
   autoSizeHeight = true;
};

new GuiControlProfile("GuiTempSpeedProfile")
{
   fontType = "Univers Condensed";
   fontSize = 16;
	fontColor = "240 0 240";
   autoSizeWidth = false;
   autoSizeHeight = true;
};

new GuiControlProfile("GuiRecordingHudProfile")
{
   fontType = "Univers Condensed";
   fontSize = 16;
	fontColor = "255 0 0";
	justify = "center";
   autoSizeWidth = false;
   autoSizeHeight = true;
};

new GuiControlProfile ("GuiChatBackProfile")
{
   bitmapbase = "gui/hud_new_window";
};

new GuiControlProfile ("HudScoreProfile")
{
   bitmap = "gui/hud_new_scorewindow";
   borderColor = "30 59 56";
};

new GuiControlProfile ("HudHelpTagProfile")
{
   borderColor = "231 101 26";
   bitmap = "gui/hud_dot";
};

new GuiControlProfile ("HudVoteBackProfile")
{
   bitmapBase = "gui/hud_new_window_B";
};

new GuiControlProfile ("GuiVMenuProfile")
{
   bitmapBase = "gui/hud_new_window";
   fontType = $ShellFont;
   fontSize = $ShellMediumFontSize;
};

new GuiControlProfile ("GuiChatHudProfile")
{
   fontType = $ShellFont;
   fontSize = $ShellFontSize;
   fontColor = "44 172 181"; // default color (death msgs, scoring, inventory)
   fontColors[1] = "4 235 105"; // client join/drop, tournament mode
   fontColors[2] = "219 200 128"; // gameplay, admin/voting, pack/deployable
   fontColors[3] = "77 253 95";  // team chat, spam protection message, client tasks
   fontColors[4] = "40 231 240";  // global chat
   fontColors[5] = "200 200 50 200";  // used in single player game
   // WARNING! Colors 6-9 are reserved for name coloring 
   autoSizeWidth = true;
   autoSizeHeight = true;
};

new GuiControlProfile ("GuiHudNavProfile")
{
//   fontType = "Univers Condensed";
//   fontSize = 16;
//   fontColor = "255 255 255";
//   autoSizeWidth = false;
//   autoSizeHeight = true;
   fontColors[6] = $PlayerNameColor;
   fontColors[7] = $TribeTagColor;  
   fontColors[8] = $SmurfNameColor; 
   fontColors[9] = $BotNameColor;   
};

new GuiControlProfile ( "GuiHudVoiceMenuProfile" )
{
   fontType = $ShellFont;
   fontSize = $ShellFontSize;
   fontColor = "70 235 200";
   justify = "left";
   autoSizeWidth = false;
   autoSizeHeight = true;
};

new GuiControlProfile ( "GuiHudVoiceCommandProfile" )
{
   fontType = $ShellFont;
   fontSize = $ShellFontSize;
   fontColor = "40 205 210";
   justify = "left";
   autoSizeWidth = false;
   autoSizeHeight = true;
};


new GuiControlProfile ("GuiCommandMsgHudProfile")
{
   fontType = "Univers Condensed";
   fontSize = 16;
   fontColor = "253 221 0";
   autoSizeWidth = false;
   autoSizeHeight = true;
   tab = false;
};

new GuiControlProfile ("GuiButtonProfile")
{
   opaque = true;
   fillColor = "232 232 232";
   border = true;
   borderColor   = "0 0 0";
   borderColorHL = "127 127 127";
   fontType = "Univers Condensed";
   fontSize = 16;
   fontColor = "0 0 0";
   fontColorHL = "32 100 100";
   fixedExtent = true;
   justify = "center";
   soundButtonDown = sButtonDown;
   soundButtonOver = sButtonOver;
	canKeyFocus = false;
};

new GuiControlProfile ("GuiHudCounterProfile")
{
   opaque = true;
   fillColor = "232 232 232";
   border = false;
   borderColor   = "0 0 0";
   borderColorHL = "127 127 127";
   fontType = $ShellFont;
   fontSize = 12;
   fontColor = "0 0 0";
   fontColorHL = "32 100 100";
   fixedExtent = true;
   justify = "center";
};

new GuiControlProfile ("GuiRadioProfile")
{
   opaque = false;
   fillColor = "232 232 232";
   border = false;
   borderColor = "0 0 0";
   fontType = "Univers";
   fontSize = 14;
   fontColor = "0 0 0";
   fontColorHL = "32 100 100";
   fixedExtent = true;
   justify = "center";
};

new GuiControlProfile ("GuiCheckBoxProfile")
{
   opaque = false;
   fillColor = "232 232 232";
   border = false;
   borderColor = "0 0 0";
   fontType = "Univers";
   fontSize = 14;
   fontColor = "0 0 0";
   fontColorHL = "32 100 100";
   fixedExtent = true;
   justify = "center";
};

new GuiControlProfile ("GuiPopUpMenuProfile")
{
   opaque = true;
   fillColor = "232 232 232";
   border = true;
   borderColor = "0 0 0";
   fontType = "Univers";
   fontSize = 14;
   fontColor = "0 0 0";
   fontColorHL = "32 100 100";
   fontColorSEL = "32 100 100";
   fixedExtent = true;
   justify = "center";
};

new GuiControlProfile ("GuiWindowProfile")
{
   opaque = true;
   fillColor = "200 200 200";
   fillColorHL = "64 150 150";
   fillColorNA = "150 150 150";
   fontType = "Univers";
   fontSize = 16;
   fontColor = "0 0 0";
   fontColorHL = "0 0 0";
   text = "GuiWindowCtrl test";
   bitmap = "gui/darkWindow";
};

new GuiControlProfile ("GuiScrollCtrlProfile")
{
   border = true;
   borderColor = "0 0 0";
   bitmap = "gui/darkScroll";
};

new GuiControlProfile ("GuiScrollContentProfile")
{
   opaque = false;
   autoSizeWidth = true;
   autoSizeHeight = true;
   border = false;

};

new GuiControlProfile ("GuiTreeViewProfile")
{
   fontType = "Lucida Console";
   fontSize = 12;
   fontColor = "0 0 0";
   fontColorHL = "255 255 255";
   bitmap = "gui/treeView";
};

new GuiControlProfile ("GuiTextArrayProfile")
{
   fontType = "Univers";
   fontSize = 16;
   fontColor = "0 0 0";
   fontColorHL = "32 100 100";
   fillColorHL = "200 200 200";
};

new GuiControlProfile ("GuiConsoleProfile")
{
   fontType = "Lucida Console";
   fontSize = 12;
   fontColor = "0 0 0";
   fontColorHL = "130 130 130";
   fontColorNA = "255 0 0";
   fontColors[6] = "50 50 50";
   fontColors[7] = "50 50 0";  
   fontColors[8] = "0 0 50"; 
   fontColors[9] = "0 50 0";   
};

new GuiControlProfile ("GuiConsoleTextProfile")
{
   fontType = "Lucida Console";
   fontSize = 12;
   fontColor = "0 0 0";
   autoSizeWidth = false;
   autoSizeHeight = true;
};

new GuiControlProfile("GuiMediumBoldTextProfile")
{
   fontType = "Univers Condensed";
   fontSize = 16;
   fontColor = "0 0 0";
   autoSizeWidth = true;
   autoSizeHeight = true;
};

new GuiControlProfile("EditTSControlProfile")
{
   fontType = "Univers";
   fontSize = 16;
   fontColor = "200 200 200";
   autoSizeWidth = true;
   autoSizeHeight = true;
   fillColor = "255 255 0";
   opaque = "true";
};

new GuiControlProfile("EditorContentProfile")
{
   fontType = "Univers";
   fontSize = 16;
   fontColor = "200 200 200";
   autoSizeWidth = true;
   autoSizeHeight = true;
   fillColor = "220 220 220";
   opaque = "true";
   border = true;
   borderColor   = "180 180 180";
};

new GuiControlProfile ("ShellProgressBarProfile")
{
   opaque = false;
   fillColor = "44 152 162 100";
   border = true;
   borderColor   = "78 88 120";
};

new GuiControlProfile ("ShellProgressBarTextProfile")
{
	fontType = $ShellLabelFont;
	fontSize = $ShellLabelFontSize;
	fontColor = "169 215 250";
   justify = "center";
};

new GuiControlProfile ("ShellLoadFrameProfile" )
{
   border = true;
   borderColor   = "78 88 120";
};

new GuiControlProfile ("ShellSubHeaderProfile" )
{
	fontType = "Univers Condensed Bold";
	fontSize = 28;
	fontColor = "66 219 234";
	justify = "left";
   autoSizeWidth = true;
   autoSizeHeight = true;
};

new GuiControlProfile( "DlgBackProfile" )
{
	opaque = true;
	fillColor = "0 0 0 160";
};

new GuiControlProfile( "MotdCProfile" )
{
	justify = "center";
	opaque = true;
    autoSizeWidth = true;
	fillColor = "0 0 0 160";
	fontType = "Univers Condensed";
	fontSize = 14;
	fontColor = "000 219 234";
};

new GuiControlProfile( "GuiInputCtrlProfile" )
{
   tab = true;
	canKeyFocus = true;
};

new GuiControlProfile( "TesterProfile" )
{
	border = true;
	borderColor = "255 255 0";
};

new GuiControlProfile ("TaskHudProfile")
{
   fontType = $ShellFont;
   fontSize = $ShellFontSize;
   fontColor = "66 229 244";
   autoSizeWidth = true;
   autoSizeHeight = true;
   fontColors[1] = "0 200 0 200";
   fontColors[2] = "200 0 0 200";
   fontColors[3] = "0 0 200 200";
   fontColors[6] = $PlayerNameColor;
   fontColors[7] = $TribeTagColor;  
   fontColors[8] = $SmurfNameColor; 
   fontColors[9] = $BotNameColor;   
};

new GuiControlProfile ("TaskHudTextProfile")
{
   fontType = $ShellLabelFont;
   fontSize = $ShellFontSize;
   fontColor = "66 229 244";
   autoSizeWidth = true;
   autoSizeHeight = true;
};

new GuiControlProfile ("ShellChatMemberListProfile")
{
   fontType = $ShellFont;
   fontSize = $ShellFontSize;
   fontColor   = "60 180 180";
   fontColorHL = "6 245 215";
   fontColorNA = "128 128 128";
   fontColorSEL = "25 68 56";
	fontColors[4] = "255 255 255";	// nick font color
	fontColors[5] = "200 255 255";	// nick highlighted color
	fontColors[6] = "0 0 0";			// nick selected color
	fontColors[7] = "255 255 0";		// tribe font color
	fontColors[8] = "200 255 0";		// tribe highlighted color
	fontColors[9] = "0 0 255";			// tribe selected color
   bitmapBase = "gui/shll_bar";
   tab = true;
   canKeyFocus = true;
};

new GuiControlProfile ("GuiChannelVectorProfile")
{
   fontType = $ShellFont;
   fontSize = $ShellFontSize;
   fontColor = "249 250 194"; 		// default font color
   fontColors[1] = "255 255 255";	// nick font color
   fontColors[2] = "255 255 0";		// tribe font color
   fontColors[3] = "0 200 0";			// server font color
   fontColors[4] = "4 235 105"; 	// client join/drop, tournament mode
   fontColors[5] = "219 200 128"; 	// gameplay, admin/voting, pack/deployable
   fontColors[6] = "77 253 95";  	// team chat, spam protection message, client tasks
   fontColors[7] = "40 231 240";  	// global chat
   fontColors[8] = "200 200 50 200";  // used in single player game
   fontColors[9] = "66 219 234";
   autoSizeWidth = false;
   autoSizeHeight = true;
};

new GuiControlProfile ("GuiTempHeatProfile")
{
   fontType = $ShellButtonFont;
   fontSize = $ShellFontSize;
   fontColor = "230 40 230";
	justify = "center";
};

new GuiControlProfile ("GuiBubblePopupProfile")
{
	border = false;
   opaque = true;
   fillColor = "3 144 156 200";
};

new GuiControlProfile ("GuiBubbleTextProfile")
{
   fontType = $ShellFont;
   fontSize = $ShellMediumFontSize;
   fontColor = "100 200 200";
   autoSizeWidth = false;
   autoSizeHeight = true;
};


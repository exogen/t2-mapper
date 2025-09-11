//------------------------------------------------------------------------------
// Cursors
//------------------------------------------------------------------------------
new GuiCursor(CMDCursorArrow)
{
   hotSpot = "6 1";
   bitmapName = "commander/cursors/com_cursor_arrow_icon";
};

new GuiCursor(CMDCursorHandOpen)
{
   hotSpot = "13 14";
   bitmapName = "commander/cursors/com_handopen_icon";
};

new GuiCursor(CMDCursorHandClosed)
{
   hotSpot = "13 14";
   bitmapName = "commander/cursors/com_handclose_icon";
};

new GuiCursor(CMDCursorZoom)
{
   hotSpot = "8 7";
   bitmapName = "commander/cursors/com_maglass_icon";
};

new GuiCursor(CMDCursorSelectAdd)
{
   hotSpot = "11 11";
   bitmapName = "commander/cursors/com_pointer_pos_icon";
};

new GuiCursor(CMDCursorSelectRemove)
{
   hotSpot = "11 11";
   bitmapName = "commander/cursors/com_pointer_icon";
};

//------------------------------------------------------------------------------
// Audio
//------------------------------------------------------------------------------

new AudioDescription(AudioLoop2D)
{
   volume = "1.0";
   isLooping = true;
   is3D = false;
   type = $GuiAudioType;
};

new AudioProfile(sStatic)
{
   filename = "fx/misc/static.wav";
   description = AudioLoop2D;
   preload = true;
};

//------------------------------------------------------------------------------
// Profiles
//------------------------------------------------------------------------------
new GuiControlProfile("CommanderTreeContentProfile")
{
   opaque = true;
   fillColor = "140 140 140";
	border = false;
};

new GuiControlProfile("CommanderScrollContentProfile")
{
   opaque = true;
   fillColor = "0 0 0";
   border = false;
};

new GuiControlProfile("CommanderButtonProfile")
{
   opaque = false;
   fontType = $ShellButtonFont;
   fontSize = $ShellButtonFontSize;
   fontColor = "8 19 6";
   fontColorHL = "25 68 56";
   fontColorNA = "98 98 98";
   fixedExtent = true;
   justify = "center";
	bitmap = "gui/shll_button";
   textOffset = "0 11";
   soundButtonOver = sButtonOver;
   tab = false;
   canKeyFocus = false;
};

new GuiControlProfile("CommanderGuiProfile")
{
   opaque = true;
   fillColor = "0 0 0";
};

new GuiControlProfile("CommanderPopupProfile")
{
   fontType = "Arial Bold";
   fontSize = 14;
   opaque = true;
   fillColor = "65 141 148";
   border = true;
   borderColor= "105 181 188";
   justify = center;

   fontColors[0] = "255 255 255";      // text color
   fontColors[1] = "255 255 0";        // hotkey color
};

new GuiControlProfile("CommanderTreeProfile")
{
   fontColors[0] = "220 220 220";      // CategoryNormal
   fontColors[1] = "230 169 0";        // CategoryHilight
   fontColors[2] = "170 170 170";      // CategoryEmpty
   fontColors[3] = "255 255 0";        // ClientNoneEntry
   fontColors[4] = "255 255 255";      // TargetEntry
};
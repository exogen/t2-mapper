////////////////////////////////////////////////////////////////////////////////////////
// z0dd - ZOD - sal9000: MOD HUD ///////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////////

function CreateModHud()
{
   $ModHudId = new GuiControl(modHud) {
      profile = "GuiDialogProfile";
      horizSizing = "width";
      vertSizing = "height";
      position = "0 0";
      extent = "640 480";
      minExtent = "8 8";
      visible = "1";
      helpTag = "0";

         new ShellPaneCtrl(modHudGui) {
            profile = "ShellDlgPaneProfile";
            horizSizing = "center";
            vertSizing = "center";
            position = "170 90";
            extent = "320 295";
            minExtent = "48 92";
            visible = "1";
            helpTag = "0";
            text = "MOD HUD";

               new GuiMLTextCtrl(modHudOpt) {
                  profile = "ShellMediumTextProfile";
                  horizSizing = "center";
                  vertSizing = "bottom";
                  position = "29 38";
                  extent = "260 18";
                  minExtent = "8 8";
                  visible = "1";
                  helpTag = "0";
                  lineSpacing = "2";
               };
               new ShellPopupMenu(modOptionMenu) {
                  profile = "ShellPopupProfile";
                  horizSizing = "right";
                  vertSizing = "bottom";
                  position = "22 49";
                  extent = "277 36";
                  minExtent = "49 36";
                  visible = "1";
                  hideCursor = "0";
                  bypassHideCursor = "0";
                  helpTag = "0";
                  text = "- OPTIONS -";
                  maxLength = "255";
                  maxPopupHeight = "200";
                  buttonBitmap = "gui/shll_pulldown";
                  rolloverBarBitmap = "gui/shll_pulldownbar_rol";
                  selectedBarBitmap = "gui/shll_pulldownbar_act";
                  noButtonStyle = "0";
               };
               new GuiMLTextCtrl(modHudSet) {
                  profile = "ShellMediumTextProfile";
                  horizSizing = "center";
                  vertSizing = "bottom";
                  position = "29 90";
                  extent = "267 18";
                  minExtent = "8 8";
                  visible = "1";
                  helpTag = "0";
                  lineSpacing = "2";
               };
               new ShellScrollCtrl(modA) {
                  profile = "NewScrollCtrlProfile";
                  horizSizing = "right";
                  vertSizing = "height";
                  position = "26 103";
                  extent = "267 70";
                  minExtent = "24 52";
                  visible = "1";
                  hideCursor = "0";
                  bypassHideCursor = "0";
                  helpTag = "0";
                  willFirstRespond = "1";
                  hScrollBar = "alwaysOff";
                  vScrollBar = "dynamic";
                  constantThumbHeight = "0";
                  defaultLineHeight = "15";
                  childMargin = "0 3";
                  fieldBase = "gui/shll_field";

                     new GuiScrollContentCtrl(modB) {
                        profile = "GuiDefaultProfile";
                        horizSizing = "right";
                        vertSizing = "bottom";
                        position = "4 7";
                        extent = "182 239";
                        minExtent = "8 8";
                        visible = "1";
                        hideCursor = "0";
                        bypassHideCursor = "0";
                        helpTag = "0";

                           new ShellTextList(modSetList) {
                              profile = "ShellTextArrayProfile";
                              horizSizing = "right";
                              vertSizing = "bottom";
                              position = "0 0";
                              extent = "182 8";
                              minExtent = "8 8";
                              visible = "1";
                              hideCursor = "0";
                              bypassHideCursor = "0";
                              helpTag = "0";
                              enumerate = "0";
                              resizeCell = "1";
                              columns = "0";
                              fitParentWidth = "1";
                              clipColumnText = "0";
                           };
                     };
               };
               new ShellBitmapButton(modCloseBtn) {
                  profile = "ShellButtonProfile";
                  horizSizing = "left";
                  vertSizing = "bottom";
                  position = "22 235";
                  extent = "137 35";
                  minExtent = "32 35";
                  visible = "1";
                  command = "HideModHud();";
                  accelerator = "return";
                  helpTag = "0";
                  text = "CLOSE";
                  simpleStyle = "0";
               };
               new ShellBitmapButton(modSubmitBtn) {
                  profile = "ShellButtonProfile";
                  horizSizing = "left";
                  vertSizing = "bottom";
                  position = "160 235";
                  extent = "137 35";
                  minExtent = "32 35";
                  visible = "1";
                  command = "modSubmit();";
                  accelerator = "return";
                  helpTag = "0";
                  text = "SUBMIT";
                  simpleStyle = "0";
               };
               new ShellBitmapButton(modBtn1) {
                  profile = "ShellButtonProfile";
                  horizSizing = "left";
                  vertSizing = "bottom";
                  position = "22 175";
                  extent = "137 35";
                  minExtent = "32 35";
                  visible = "0";
                  command = "modBtnProg(11);";
                  accelerator = "return";
                  helpTag = "0";
                  text = "-Empty-";
                  simpleStyle = "0";
               };
               new ShellBitmapButton(modBtn2) {
                  profile = "ShellButtonProfile";
                  horizSizing = "left";
                  vertSizing = "bottom";
                  position = "160 175";
                  extent = "137 35";
                  minExtent = "32 35";
                  visible = "0";
                  command = "modBtnProg(12);";
                  accelerator = "return";
                  helpTag = "0";
                  text = "-Empty-";
                  simpleStyle = "0";
               };
               new ShellBitmapButton(modBtn3) {
                  profile = "ShellButtonProfile";
                  horizSizing = "left";
                  vertSizing = "bottom";
                  position = "22 205";
                  extent = "137 35";
                  minExtent = "32 35";
                  visible = "0";
                  command = "modBtnProg(13);";
                  accelerator = "return";
                  helpTag = "0";
                  text = "-Empty-";
                  simpleStyle = "0";
               };
               new ShellBitmapButton(modBtn4) {
                  profile = "ShellButtonProfile";
                  horizSizing = "left";
                  vertSizing = "bottom";
                  position = "160 205";
                  extent = "137 35";
                  minExtent = "32 35";
                  visible = "0";
                  command = "modBtnProg(14);";
                  accelerator = "return";
                  helpTag = "0";
                  text = "-Empty-";
                  simpleStyle = "0";
               };
         };
   };
}

function handleActivateModHud(%msgType, %msgString, %a1, %a2, %a3, %a4, %a5, %a6, %a7, %a8)
{
   if(!$ModHudCreated)
   {
      CreateModHud();
      $ModHudCreated = 1;
   }
}

function handleInitModHud(%msgType, %msgString, %gameType, %a2, %a3, %a4, %a5, %a6)
{
   if($ModHudCreated)
      commandToServer('ModHudInitialize', true);
}

addMessageCallback('MsgClientJoin', handleActivateModHud);
addMessageCallback('MsgClientReady', handleInitModHud);

// Get the headings from the server
function clientCMDModHudHead(%head, %opt, %set)
{
   modHudGui.settitle(%head);
   modHudOpt.setvalue(%opt);
   modHudSet.setvalue(%set);
}

function clientCMDModHudDone()
{
   $ModArray[curopt] = 1;
   modOptionMenu.clear();
   for(%z = 1; %z <= $ModArray[index]; %z++)
   {
      %nam = $ModArray[%z, nam];
      modOptionMenu.add(%nam, %z);
   }
   modOptionMenu.setSelected($ModArray[curopt]);
   modArrayCallOption($ModArray[curopt]);
}

function modArrayCallOption(%opt)
{
   modSetList.clear();
   for(%x = 1; %x <= $ModArray[%opt, noa]; %x++)
   {
      %nam = $ModArray[%opt, %x];
      modSetList.addRow(%x, %nam);
   }
   %pal = $ModArray[%opt, pal];
   %cur = $ModArray[%opt, cur];
   if(%cur $= "")
      modSetList.setSelectedByID(%pal);
   else
      modSetList.setSelectedByID(%cur);
}

function clientCMDInitializeModHud(%mod)
{
   for(%i = 0; $ModArray[%i, nam] !$= ""; %i++)
   {
      $ModArray[%i, cur] = "";
      $ModArray[%i, pal] = "";
      $ModArray[%i, nam] = "";
      $ModArray[%i, noa] = "";
      $ModArray[%i, index] = "";
      for(%j = 0; %j < 10; %j++)
         $ModArray[%i, %j] = "";
   }
   $ModArray[curmode] = %mod;
   $ModArray[index] = 0;
}

function modHudExport()
{
   if($ModArray[curmode] $= "")
      return;

   for(%z = 1; %z <= $ModArray[curopt]; %z++)
   {
      %pal = $ModArray[%z, pal];
      $ModExport[modStu($ModArray[curmode]), modStu($ModArray[%z, index])] = $ModArray[%z, %pal];
   }
   export("$ModExport*", "scripts/autoexec/modExport.cs", false);
}

function modStu(%str)
{
   return strreplace(%str, " ", "_");
}

function clientCMDModHudPopulate(%option, %a1, %a2, %a3, %a4, %a5, %a6, %a7, %a8, %a9, %a10)
{
   %s[1] = %a1;
   %s[2] = %a2;
   %s[3] = %a3;
   %s[4] = %a4;
   %s[5] = %a5;
   %s[6] = %a6;
   %s[7] = %a7;
   %s[8] = %a8;
   %s[9] = %a9;
   %s[10] = %a10;

   $ModArray[index]++;
   $ModArray[curopt] = $ModArray[index];
   %cur = $ModArray[curopt];
   $ModArray[%cur, pal] = "";
   $ModArray[%cur, cur] = "";
   $ModArray[%cur, nam] = %option;

   %z = 0;
   while(%s[%z++] !$= "") {
      $ModArray[%cur, %z] = %s[%z];
      %pal = $ModExport[modStu($ModArray[curmode]), modStu(%opt)];
      if(%s[%z] $= %pal)
         %palm = %z;
   }
   if(%palm $= "") {
      $ModArray[%cur, cur] = "1";
      $ModArray[%cur, pal] = "1";
      %id =1;
   }
   else {
      $ModArray[%cur, cur] = %palm;
      $ModArray[%cur, pal] = %palm;
      %id = %palm;
   }
   commandToServer('ModUpdateSettings', %cur, %id);
   $ModArray[%cur, noa] = %z-1;
}

function modSetList::onSelect(%this, %id, %text)
{
   $ModArray[$ModArray[curopt], cur] = %id;
   //commandToServer('ModUpdateSettings', $ModArray[curopt], %id);
}

function modOptionMenu::onSelect(%this, %id, %text)
{
   $ModArray[curopt] = %id;
   modArraycallOption(%id);
}

function ShowModHud()
{
   canvas.pushdialog(modHud);
   $ModHudOpen = 1;
   //clientCmdTogglePlayHuds(false);
}

function HideModHud()
{
   modHudExport();
   canvas.popdialog(modHud);
   $ModHudOpen = 0;
   //clientCmdTogglePlayHuds(true);
}

function modHud::onWake( %this )
{
   if ($HudHandle[modHud] !$= "")
      alxStop($HudHandle[inventoryScreen]);

   alxPlay(HudInventoryActivateSound, 0, 0, 0);
   $HudHandle[modHud] = alxPlay(HudInventoryHumSound, 0, 0, 0);

   if ( isObject( modHudMap ) )
   {
      modHudMap.pop();
      modHudMap.delete();
   }
   new ActionMap( modHudMap );
   modHudMap.blockBind( moveMap, togglePracticeHud );
   modHudMap.blockBind( moveMap, toggleAdminHud );
   modHudMap.blockBind( moveMap, toggleInventoryHud );
   modHudMap.blockBind( moveMap, toggleScoreScreen );
   modHudMap.blockBind( moveMap, toggleCommanderMap );
   modHudMap.bindCmd( keyboard, escape, "", "HideModHud();" );
   modHudMap.push();
}

function modHud::onSleep( %this )
{
   %this.callback = "";
   modHudMap.pop();
   modHudMap.delete();
   alxStop($HudHandle[modHud]);
   alxPlay(HudInventoryDeactivateSound, 0, 0, 0);
   $HudHandle[modHud] = "";
}

////////////////////////////////////////////////////////////////////////////////////////
// Button functions ////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////////

function modSubmit()
{
   // Send the currently selected option and setting to the server
   commandToServer('ModUpdateSettings', $ModArray[curopt], $ModArray[$ModArray[curopt], cur]);
   modHudExport();
}

function modBtnProg(%button)
{
   switch ( %button )
   {
      case 11:
         %value = modBtn1.getValue();
      case 12:
         %value = modBtn2.getValue();
      case 13:
         %value = modBtn3.getValue();
      case 14:
         %value = modBtn4.getValue();
      default:
         %value = "";
   }
   commandToServer('ModButtonSet', %button, %value);
   //HideModHud();
}

function clientCMDModHudBtn1(%text, %enabled, %visible)
{
   modBtn1.setActive(%enabled);
   modBtn1.visible = %visible;
   if(%text !$= "")
      modBtn1.text = %text;
}

function clientCMDModHudBtn2(%text, %enabled, %visible)
{
   modBtn2.setActive(%enabled);
   modBtn2.visible = %visible;
   if(%text !$= "")
      modBtn2.text = %text;
}

function clientCMDModHudBtn3(%text, %enabled, %visible)
{
   modBtn3.setActive(%enabled);
   modBtn3.visible = %visible;
   if(%text !$= "")
      modBtn3.text = %text;
}

function clientCMDModHudBtn4(%text, %enabled, %visible)
{
   modBtn4.setActive(%enabled);
   modBtn4.visible = %visible;
   if(%text !$= "")
      modBtn4.text = %text;
}

////////////////////////////////////////////////////////////////////////////////////////
// Server functions ////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////////

function serverCMDModHudInitialize(%client, %value)
{
   Game.InitModHud(%client, %value);
}

function serverCmdModUpdateSettings(%client, %option, %value)
{
   // %option is the index # of the hud list option
   // %value is the index # of the hud list setting

   %option = deTag(%option);
   %value = deTag(%value);
   Game.UpdateModHudSet(%client, %option, %value);
}

function serverCmdModButtonSet(%client, %button, %value)
{
   %button = deTag(%button);
   %value = deTag(%value);
   Game.ModButtonCmd(%client, %button, %value);
}

function DefaultGame::InitModHud(%game, %client, %value)
{
   // Clear out any previous settings
   //commandToClient(%client, 'InitializeModHud', "ModName");

   // Send the hud labels                 |  Hud Label  |  | Option label | | Setting label |
   //commandToClient(%client, 'ModHudHead', "MOD NAME HUD",      "Option:",       "Setting:");

   // Send the Option list and settings per option    | Option |    | Setting |
   //commandToClient(%client, 'ModHudPopulate',          "Example1",   "Empty");
   //commandToClient(%client, 'ModHudPopulate',          "Example2",   "Setting1", "Setting2", "Setting3", "Setting4", "Setting5", "Setting6", "Setting7", "Setting8", "Setting9", "Setting10");

   // Send the button labels and visual settings  |  Button  |  | Label |  | Visible |  | Active |
   //commandToClient(%client,                       'ModHudBtn1',  "BUTTON1",      1,          1);
   //commandToClient(%client,                       'ModHudBtn2',  "BUTTON2",      1,          1);
   //commandToClient(%client,                       'ModHudBtn3',  "BUTTON3",      1,          1);
   //commandToClient(%client,                       'ModHudBtn4',  "BUTTON4",      1,          1);

   // We're done!
   //commandToClient(%client, 'ModHudDone');
}

function DefaultGame::UpdateModHudSet(%game, %client, %option, %value)
{
   // 1 = Example1
   // 2 = Example2

   //switch$ ( %option )
   //{
   //   case 1:
   //      %msg = '\c2Something set to: %2.';

   //   case 2:
   //      %msg = '\c2Something set to: %2.';

   //   default:
   //      %msg = '\c2Invalid setting.';
   //}
   //messageClient( %client, 'MsgModHud', %msg, %option, %value );
}

function DefaultGame::ModButtonCmd(%game, %client, %button, %value)
{
   // 11 = Button 1
   // 12 = Button 2
   // 13 = Button 3
   // 14 = Button 4

   //switch ( %button )
   //{
   //   case 11:
   //      %msg = '\c2Something set to: %2.';

   //   case 12:
   //      %msg = '\c2Something set to: %2.';

   //   case 13:
   //      %msg = '\c2Something set to: %2.';

   //   case 14:
   //      %msg = '\c2Something set to: %2.';

   //   default:
   //      %msg = '\c2Invalid setting.';
   //}
   //messageClient( %client, 'MsgModHud', %msg, %button, %value );
}

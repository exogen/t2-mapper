function RecordingsDlg::onWake(%gui)
{
   %gui.fillRecordingsList();
   updateRecordingButtons();
}

function msToMinSec(%time)
{
   %sec = mFloor(%time / 1000);
   %min = mFloor(%sec / 60);
   %sec -= %min * 60;
   
   // pad it
   if(%min < 10)
      %min = "0" @ %min;
   if(%sec < 10)
      %sec = "0" @ %sec;

   return(%min @ ":" @ %sec);
}

function RecordingsDlg::fillRecordingsList(%gui)
{
   // setup the ctrl
   if(!%gui.initialized)
   {
      RecordingsDlgList.setSortColumn(0);
      RecordingsDlgList.setSortIncreasing(true);

      RecordingsDlgList.addStyle(1, $ShellFont, $ShellFontSize, "80 220 200", "30 255 225", "10 60 40" );
      RecordingsDlgList.addStyle(2, $ShellFont, $ShellFontSize, "120 120 120", "120 120 120", "120 120 120" );

      // add the columns
      RecordingsDlgList.addColumn(0, "Recording", 200, 100, 300);
      RecordingsDlgList.addColumn(1, "Time", 140, 60, 180, "filetime center");
      RecordingsDlgList.addColumn(2, "Length (min:sec)", 40, 40, 80, "center");
      
      %gui.initialized = true;
   }

   RecordingsDlgList.clear();
   RecordingsDlgList.clearList();

   // process all the recordings
   %search = "recordings/*.rec";
   %ct = 0;
   %demoVersion = getDemoVersion();

   for(%file = findFirstFile(%search); %file !$= ""; %file = findNextFile(%search))
   {
      %fileName = fileBase(%file);

      // query the version/length of the recording
      %val = getDemoVersionLength(%file);
      %version = getField(%val, 0);

      // unknown version
      if(%version == -1)
      {
         %version = "???";
         %length = "???";
      }
      else
         %length = msToMinSec(getField(%val, 1));

      %fileTime = getFileModifyTime(%file);
      RecordingsDlgList.addRow(%ct, %fileName TAB %fileTime TAB %length);
      RecordingsDlgList.setRowStyle(%ct, (%version == %demoVersion) ? 1 : 2);
      
      %ct++;
   }

   RecordingsDlgList.sort(0, true);
   RecordingsDlgList.setSelectedRow(0);
}

function updateRecordingButtons()
{
   %active = RecordingsDlgList.rowCount() != 0;
   PR_StartDemoBtn.setActive(%active);
   PR_DeleteDemoBtn.setActive(%active);
   PR_RenameDemoBtn.setActive(%active);
   
   if(%active)
      PR_StartDemoBtn.makeFirstResponder(1);
   else
      PR_CancelBtn.makeFirstResponder(1);
}

//-------------------------------------------------------------------------
// functions to handle the progress bar for loading demo
function DemoLoadProgressDlg::onWake(%this)
{
   DemoLoadProgressCtrl.setValue(0.0);
}

function demoUpdateDatablockProgress(%count, %total)
{
   DemoLoadProgressCtrl.setValue(%count / %total);
}

//-------------------------------------------------------------------------
// sequential variables named $DemoValue[?] will be stored in the demo stream
// and accessable right after the demo has been loaded
function saveDemoSettings()
{
   $DemoValueIdx = 0;

   getState(MISC);

   // store the playergroup
   getState(PLAYERLIST);

   // get the states for all the gui's of interest
   getState(RETICLE);
   getState(BACKPACK);
   getState(WEAPON);
   getState(INVENTORY);
   getState(SCORE);
   getState(CLOCK);
   getState(CHAT);
   
   // KP:  save gravity
   getState(GRAVITY);
}  

function resetGameState()
{
   $timeScale = 1;

   // reset some state
   HudMessageVector.clear();
   if(isObject(PlayerListGroup))
      PlayerListGroup.delete();

   // stop all sound
   alxStopAll();

   // clean up voting
   voteHud.voting = false;
   mainVoteHud.setvisible(0);
   
   // clear all print messages
   clientCmdclearBottomPrint();
   clientCmdClearCenterPrint();

   clientCmdResetCommandMap();

   // clear the inventory and weapons hud
   weaponsHud.reset();
   inventoryHud.reset();

   // reset the objective hud
   objectiveHud.setSeparators("");
   objectiveHud.disableHorzSeparator();
   while(objectiveHud.getCount() > 0)
      objectiveHud.getObject(0).delete();
}

function loadDemoSettings()
{
   $DemoValueIdx = 0;

   setState(MISC);

   // restore the playergroup
   setState(PLAYERLIST);
   
   // set the states for all the gui's of interest
   setState(RETICLE);
   setState(BACKPACK);
   setState(WEAPON);
   setState(INVENTORY);
   setState(SCORE);
   setState(CLOCK);
   setState(CHAT);
   
   // KP:  load gravity
   setState(GRAVITY);
}

function addDemoValue(%val)
{
   // make sure variables get saved
   if(%val $= "")
      %val = "<BLANK>";

   $DemoValue[$DemoValueIdx] = %val;
   $DemoValueIdx++;
}

function getDemoValue()
{
   %val = $DemoValue[$DemoValueIdx];
   $DemoValueIdx++;

   if(%val $= "<BLANK>")
      %val = "";

   return(%val);
}

//-------------------------------------------------------------------------
// get/setState
// - strings max of 255 chars
function getState(%type)
{
   switch$(%type)
   {
      case MISC:
         addDemoValue( $HudMode TAB $HudModeType TAB $HudModeNode TAB voteHud.voting TAB isObject(passengerKeys) TAB musicPlayer.currentTrack );
         
      case PLAYERLIST:

         %count = PlayerListGroup.getCount();
         addDemoValue(%count);
         for(%i = 0; %i < %count; %i++)
         {
            %obj = PlayerListGroup.getObject(%i);
            addDemoValue( %obj.name TAB
                          %obj.guid TAB
                          %obj.clientId TAB
                          %obj.targetId TAB
                          %obj.teamId TAB
                          %obj.score TAB
                          %obj.ping TAB
                          %obj.packetLoss TAB
                          %obj.chatMuted TAB
                          %obj.canListen TAB
                          %obj.voiceEnabled TAB
                          %obj.isListening TAB
                          %obj.isBot TAB
                          %obj.isAdmin TAB
                          %obj.isSuperAdmin TAB
                          %obj.isSmurf );
         }
         
      case RETICLE:
         addDemoValue( reticleHud.bitmap TAB 
                       reticleHud.isVisible() TAB 
                       retCenterHud.isVisible() TAB 
                       ammoHud.isVisible() TAB 
                       ammoHud.getValue() TAB
                       deploySensor.isVisible() TAB
                       reticleFrameHud.isVisible() );

      case BACKPACK:
         addDemoValue( backpackIcon.bitmap TAB backpackFrame.isVisible() TAB backpackText.getValue() TAB backpackText.isVisible TAB backpackFrame.pack );

      case WEAPON:
         %count = weaponsHud.getNumItems();
         %slotCount = weaponsHud.getNumSlots();
         %active = weaponsHud.getActiveItem();

         // visible/bitmaps(3)/count/slotcount/active
         addDemoValue( weaponsHud.isVisible() TAB weaponsHud.getBackgroundBitmap() TAB weaponsHud.getHighLightBitmap() TAB weaponsHud.getInfiniteBitmap() TAB %count TAB %slotCount TAB %active );

         // images
         for(%i = 0; %i < %count; %i++)
            addDemoValue( $WeaponNames[%i] TAB weaponsHud.getItemBitmap(%i) );

         // items
         for(%i = 0; %i < %slotCount; %i++)
            addDemoValue( weaponsHud.getSlotId(%i) TAB weaponsHud.getSlotCount(%i) );

      case INVENTORY:
         // count/active
         %count = inventoryHud.getNumItems();
         %slotCount = inventoryHud.getNumSlots();
         %active = inventoryHud.getActiveItem();

         // visible/bitmaps(3)/count/slotCount/active
         addDemoValue( inventoryHud.isVisible() TAB inventoryHud.getBackgroundBitmap() TAB inventoryHud.getHighLightBitmap() TAB inventoryHud.getInfiniteBitmap() TAB %count TAB %slotCount TAB %active );

         // images
         for(%i = 0; %i < %count; %i++)
            addDemoValue( inventoryHud.getItemBitmap(%i) );
      
         // items
         for(%i = 0; %i < %slotCount; %i++)
            addDemoValue( inventoryHud.getSlotId(%i) TAB inventoryHud.getSlotCount(%i) );

      case SCORE:
         %objCount = objectiveHud.getCount();
         
         // visible/gametype/numobjects
         addDemoValue( objectiveHud.isVisible() TAB objectiveHud.gameType TAB %objCount );

         // only text ctrls exist in this thing.. so just dump the strings
         for(%i = 0; %i < %objCount; %i++)
            addDemoValue(objectiveHud.getObject(%i).getValue());

      case CLOCK:
         addDemoValue( clockHud.isVisible() TAB clockHud.getTime() );
         
      case CHAT:

         // store last 10 messages
         %numLines = HudMessageVector.getNumLines();
         for(%i = (%numLines - 10); %i < %numLines; %i++)
         {
            if(%i < 0)
               addDemoValue("");
            else
               addDemoValue(HudMessageVector.getLineText(%i));
         }
         
      case GRAVITY:
         // KP + PanamaJack
         // Store the gravity setting regardless of what it is
         addDemoValue(getGravity());
   }
}

function setState(%type)
{
   switch$(%type)
   {
      case MISC:
         %val = getDemoValue();
         $HudMode = getField(%val, 0);
         $HudModeType = getField(%val, 1);
         $HudModeNode = getField(%val, 2);
         voteHud.voting = getField(%val, 3);

         clientCmdSetDefaultVehicleKeys(getField(%val, 4));
         clientCmdPlayMusic(getField(%val, 5));

         ClientCmdDisplayHuds();
         
      case PLAYERLIST:
         new SimGroup("PlayerListGroup");
         %count = getDemoValue();
         for(%i = 0; %i < %count; %i++)
         {
            %val = getDemoValue();
            
            %player = new ScriptObject()
            {
               className = "PlayerRep";
               name = getField(%val, 0);
               guid = getField(%val, 1);
               clientId = getField(%val, 2);
               targetId = getField(%val, 3);
               teamId = getField(%val, 4);
               score = getField(%val, 5);
               ping = getField(%val, 6);
               packetLoss = getField(%val, 7);
               chatMuted = getField(%val, 8);
               canListen = getField(%val, 9);
               voiceEnabled = getField(%val, 10);
               isListening = getField(%val, 11);
               isBot = getField(%val, 12);
               isAdmin = getField(%val, 13);
               isSuperAdmin = getField(%val, 14);
               isSmurf = getField(%val, 15);
            };

            PlayerListGroup.add(%player);
            $PlayerList[%player.clientId] = %player;

            lobbyUpdatePlayer(%player.clientId);
         }
         
      case RETICLE:
         %val = getDemoValue();
         reticleHud.setBitmap(getField(%val, 0));
         reticleHud.setVisible(getField(%val, 1));
         retCenterHud.setVisible(getField(%val, 2));
         ammoHud.setVisible(getField(%val, 3));
         ammoHud.setValue(getField(%val, 4));
         deploySensor.setVisible(getField(%val, 5));
         reticleFrameHud.setVisible(getField(%val, 6));

      case BACKPACK:
         %val = getDemoValue();
         backpackIcon.setBitmap(getField(%val, 0));
         backpackFrame.setVisible(getField(%val, 1));
         backpackText.setValue(getField(%val, 2));
         backpackText.setVisible(getField(%val, 3));
         backpackFrame.pack = getField(%val, 4);
 
      case WEAPON:
         %val = getDemoValue();

         // visible
         weaponsHud.reset();
         weaponsHud.setVisible(getField(%val, 0));
         
         // bitmaps
         weaponsHud.setBackgroundBitmap(getField(%val, 1));
         weaponsHud.setHighLightBitmap(getField(%val, 2));
         weaponsHud.setInfiniteAmmoBitmap(getField(%val, 3));
         
         // count/slotCount/active
         %count = getField(%val, 4);
         %slotCount = getField(%val, 5);
         %active = getField(%val, 6);

         // bitmaps
         for(%i = 0; %i < %count; %i++)
         {
            %val = getDemoValue();
            $WeaponNames[%i] = getField(%val, 0);
            weaponsHud.setWeaponBitmap(%i, getField(%val, 1));
         }

         // items
         for(%i = 0; %i < %slotCount; %i++)
         {
            %val = getDemoValue();
            weaponsHud.addWeapon(getField(%val, 0), getField(%val, 1));
         }

         // active
         weaponsHud.setActiveWeapon(%active);
 
      case INVENTORY:
         %val = getDemoValue();

         // visible
         inventoryHud.reset();
         inventoryHud.setVisible(getField(%val, 0));
         
         // bitmaps   
         inventoryHud.setBackgroundBitmap(getField(%val, 1));
         inventoryHud.setHighLightBitmap(getField(%val, 2));
         inventoryHud.setInfiniteAmountBitmap(getField(%val, 3));

         // count/slotCount/active
         %count = getField(%val, 4);
         %slotCount = getField(%val, 5);
         %active = getField(%val, 6);

         // images
         for(%i = 0; %i < %count; %i++)
         {
            %val = getDemoValue();
            inventoryHud.setInventoryBitmap(%i, %val);
         }
         
         // items
         for(%i = 0; %i < %slotCount; %i++)
         {
            %val = getDemoValue();
            inventoryHud.addInventory(getField(%val, 0), getField(%val, 1));
         }

         // active
         inventoryHud.setActiveInventory(%active);

      case SCORE:
         %val = getDemoValue();

         objectiveHud.setVisible(getField(%val, 0));
         setupObjHud(getField(%val, 1));
         %objCount = getField(%val, 2);

         // must read in all values even if not used
         for(%i = 0; %i < %objCount; %i++)
         {
            %val = getDemoValue();
            if(%i < objectiveHud.getCount())
               objectiveHud.getObject(%i).setValue(%val);
         }

      case CLOCK:
         %val = getDemoValue();
         clockHud.setVisible(getField(%val, 0));
         clockHud.setTime(getField(%val, 1));

      case CHAT:
         HudMessageVector.clear();
         for(%i = 0; %i < 10; %i++)
         {
            %val = getDemoValue();
            if(%val !$= "")
               HudMessageVector.pushBackLine(%val);
         }
         
      case GRAVITY:
         // KP
         // Try to get a gravity value, but don't set gravity unless it's valid.
         %gravity = getDemoValue();
         if (%gravity !$= "")
            setGravity(%gravity);
   }
}

//-------------------------------------------------------------------------
function doRecordingDelete(%file)
{
   // delete it
   if(deleteFile("recordings/" @ %file @ ".rec"))
   {
      %sel = RecordingsDlgList.getSelectedId();
      RecordingsDlgList.removeRowById(%sel);
      RecordingsDlgList.setSelectedRow(0);
      
      updateRecordingButtons();
   }
   else
      messageBoxOK("Failed", "Failed to remove file '" @ %file @ "'.");
}

function DeleteSelectedDemo()
{
   %sel = RecordingsDlgList.getSelectedId();
   %file = getField(RecordingsDlgList.getRowTextById(%sel), 0);
   
   messageBoxOkCancel("Delete Recording?", "Are you sure you wish to delete recording file '" @ %file @ "'?", "doRecordingDelete(\"" @ %file @ "\");");
}

function StartSelectedDemo()
{
   // first unit is filename
   %sel = RecordingsDlgList.getSelectedId();
   %rowText = RecordingsDlgList.getRowTextById(%sel);

   %file = "recordings/" @ getField(%rowText, 0) @ ".rec";
   %verLen = getDemoVersionLength(%file);

   Canvas.pushDialog(DemoLoadProgressDlg);
   if(playDemo(%file))
   {
      // do not allow new sources to have a force feedback effect
      alxEnableForceFeedback(false);

      resetGameState();
      Canvas.popDialog(DemoLoadProgressDlg);
      Canvas.popDialog(RecordingsDlg);   
      Canvas.setContent(PlayGui);
      loadDemoSettings();

      $DemoPlaybackIndex = 5;
      $DemoPlaybackLastIndex = 5;

      // setup the global action map
      GlobalActionMap.bindCmd(keyboard, "escape", "", "stopDemoPlayback();");
      GlobalActionMap.bindCmd(keyboard, "tab", "", "toggleDemoPlaybackHud();");
      GlobalActionMap.bindCmd(keyboard, "space", "", "toggleDemoPause();");
      GlobalActionMap.bindCmd(keyboard, "numpadadd", "", "stepDemoPlaybackSpeed(1);");
      GlobalActionMap.bindCmd(keyboard, "numpadminus", "", "stepDemoPlaybackSpeed(-1);");
      $globalActionMapOnly = true;

      $DemoPlaybackProgress = 0;
      $DemoPlaybackLength = getField(%verLen, 1);

      // playback length may be 0 if recording was not clean (just set to 1min)
      if($DemoPlaybackLength == 0)
         $DemoPlaybackLength = 60000;
      
      DemoPlayback_EndTime.setValue(msToMinSec($DemoPlaybackLength));

      $DemoPlaybackIndex = 5;
      $DemoPlaybackLastIndex = 5;
      $DemoPlaybackProgress = 0;
      demoPlaybackUpdate(0);

      updateDemoPlaybackStatus();
   }
   else
      MessageBoxOK("Playback Failed", "Demo playback failed for file '" @ %file @ "'.");

   Canvas.popDialog(DemoLoadProgressDlg);
}

function demoPlaybackComplete()
{
   alxStopAll();

   // allow new sources to have a force feedback effect
   alxEnableForceFeedback(true);

   // remove the playback dialog
   if(DemoPlaybackDlg.isAwake())
      Canvas.popDialog(DemoPlaybackDlg);

   Canvas.setContent("LaunchGui");
   Canvas.pushDialog(RecordingsDlg);

   // cleanup
   resetGameState();
   purgeResources();
   
   // clean the globalActionMap
   GlobalActionMap.unbind(keyboard, escape);
   GlobalActionMap.unbind(keyboard, tab);
   GlobalActionMap.unbind(keyboard, space);
   GlobalActionMap.unbind(keyboard, numpadadd);
   GlobalActionMap.unbind(keyboard, numpadminus);
   $globalActionMapOnly = false;
}

//-------------------------------------------------------------------------
function doDemoFileRename()
{
   // first unit is filename
   %sel = RecordingsDlgList.getSelectedId();
   %file = getField(RecordingsDlgList.getRowTextById(%sel), 0);

   %newFile = DemoRenameFile_Edit.getValue();
   
   if(%file $= %newFile)
      return;

   if(%newFile !$= "")
   {
      if(renameFile("recordings/" @ %file @ ".rec", "recordings/" @ %newFile @ ".rec"))
      {
         rebuildModPaths();
         RecordingsDlg.fillRecordingsList();
         return;
      }
   }

   MessageBoxOK("Rename Failed", "Failed to rename file '" @ %file @ "' to '" @ %newFile @ "'.");
}

function RenameSelectedDemo()
{
   // first unit is filename
   %sel = RecordingsDlgList.getSelectedId();
   %file = getField(RecordingsDlgList.getRowTextById(%sel), 0);

   DemoRenameFile_Edit.setValue(%file);
   Canvas.pushDialog(DemoRenameFileDlg);
}

//--------------------------------------------------------------------------
function beginDemoRecord()
{
   if(isDemo())
      return;

   // make sure that current recording stream is stopped
   stopDemoRecord();
   
   for(%i = 0; %i < 1000; %i++)
   {
      %num = %i;
      if(%num < 10)
         %num = "0" @ %num;
      if(%num < 100)
         %num = "0" @ %num;
      %file = "recordings/demo" @ %num @ ".rec";
      if(!isfile(%file))
         break;
   }
   if(%i == 1000)
      return;

   $DemoFile = %file;

   addMessageHudLine( "\c4Recording to file [\c2" @ $DemoFile @ "\cr].");

   saveDemoSettings();
   startRecord(%file);

   // make sure start worked
   if(!isRecordingDemo())
   {
      deleteFile("recordings/" @ $DemoFile @ ".rec");
      addMessageHudLine( "\c3 *** Failed to record to file [\c2" @ $DemoFile @ "\cr].");
      $DemoFile = "";
   }
}

function stopDemoRecord()
{
   if(isDemo())
      return;

   // make sure we are recording (and have a valid file)
   if(isRecordingDemo())
      stopRecord();
}

function demoRecordComplete()
{
   // tell the user
   if($DemoFile !$= "")
   {
      addMessageHudLine( "\c4Stopped recording to file [\c2" @ $DemoFile @ "\cr].");
      $DemoFile = "";
   }
}

//-------------------------------------------------------------------------
function toggleDemoPlaybackHud()
{
   if(DemoPlaybackDlg.isAwake())
      Canvas.popDialog(DemoPlaybackDlg);
   else
      Canvas.pushDialog(DemoPlaybackDlg, 99);
}

$DemoPlaybackText[0] = "Paused";       $DemoPlaybackSpeed[0] = 0;
$DemoPlaybackText[1] = "Play 1/16X";   $DemoPlaybackSpeed[1] = 0.0625;
$DemoPlaybackText[2] = "Play 1/8X";    $DemoPlaybackSpeed[2] = 0.125;
$DemoPlaybackText[3] = "Play 1/4X";    $DemoPlaybackSpeed[3] = 0.25;
$DemoPlaybackText[4] = "Play 1/2X";    $DemoPlaybackSpeed[4] = 0.5;
$DemoPlaybackText[5] = "Play 1X";      $DemoPlaybackSpeed[5] = 1;
$DemoPlaybackText[6] = "Play 2X";      $DemoPlaybackSpeed[6] = 2;
$DemoPlaybackText[7] = "Play 4X";      $DemoPlaybackSpeed[7] = 4;
$DemoPlaybackText[8] = "Play 8X";      $DemoPlaybackSpeed[8] = 8;
$DemoPlaybackText[9] = "Play 16X";      $DemoPlaybackSpeed[9] = 16;

// called after each processTime
function demoPlaybackUpdate(%curTime)
{
   DemoPlayback_CurTime.setValue(msToMinSec(%curTime));
   $DemoPlaybackProgress = %curTime / $DemoPlaybackLength;
}

function updateDemoPlaybackStatus()
{
   // clamp the speed
   if($DemoPlaybackIndex < 0)
      $DemoPlaybackIndex = 0;

   if($DemoPlaybackIndex > 9)
      $DemoPlaybackIndex = 9;

   DemoPlayback_StatusText.setValue($DemoPlaybackText[$DemoPlaybackIndex]);
   $timeScale = $DemoPlaybackSpeed[$DemoPlaybackIndex];
}

function toggleDemoPause()
{
   // save the current index for unpause
   if($DemoPlaybackIndex == 0)
      $DemoPlaybackIndex = $DemoPlaybackLastIndex;
   else
   {
      $DemoPlaybackLastIndex = $DemoPlaybackIndex;
      $DemoPlaybackIndex = 0;
   }

   updateDemoPlaybackStatus();
}

function stepDemoPlaybackSpeed(%step)
{
   $DemoPlaybackIndex += %step;
   updateDemoPlaybackStatus();
}

function DemoPlaybackDlg::onWake(%this)
{
   updateDemoPlaybackStatus();
}

//--------------------------------------------------------------------------
// ActionMap:
//--------------------------------------------------------------------------
$CommanderMap::useMovementKeys = false;

// help overlay toggle
function toggleCmdMapHelpGui( %val )
{
   if ( %val)
      toggleCmdMapHelpText();
}

// shortcuts to buttons: top buttons
function toggleAction(%control)
{
   %control.setValue(!%control.getValue());
   %control.onAction();
}

function bindAction(%fromMap, %command, %bindCmd, %bind1, %bind2 )
{
   if(!isObject(%fromMap))
      return(false);
   
   %bind = %fromMap.getBinding(%command);
   if(%bind $= "")
      return(false);
   
   // only allow keyboard
   %device = getField(%bind, 0);
   if(%device !$= "keyboard")
      return(false);
      
   %action = getField(%bind, 1);
   
   // bind or bindcmd?
   if(%bindCmd)
      CommanderKeyMap.bindCmd( %device, %action, %bind1, %bind2 );
   else
      CommanderKeyMap.bind( %device, %action, %bind1 );

   return(true);
}

function createCommanderKeyMap()
{
   if(isObject(CommanderKeyMap))
      CommanderKeyMap.delete();
   
   new ActionMap(CommanderKeyMap);
   
   // copy in all the binds we want from the moveMap
   CommanderKeyMap.copyBind( moveMap, ToggleMessageHud );
   CommanderKeyMap.copyBind( moveMap, TeamMessageHud );
   CommanderKeyMap.copyBind( moveMap, resizeChatHud );
   CommanderKeyMap.copyBind( moveMap, pageMessageHudUp );
   CommanderKeyMap.copyBind( moveMap, pageMessageHudDown );
   CommanderKeyMap.copyBind( moveMap, activateChatMenuHud );

   // Miscellaneous other binds:
   CommanderKeyMap.copyBind( moveMap, voteYes );
   CommanderKeyMap.copyBind( moveMap, voteNo );
   CommanderKeyMap.copyBind( moveMap, toggleCommanderMap );
   CommanderKeyMap.copyBind( moveMap, toggleHelpGui );
   CommanderKeyMap.copyBind( moveMap, toggleScoreScreen);
   CommanderKeyMap.copyBind( moveMap, startRecordingDemo );
   CommanderKeyMap.copyBind( moveMap, stopRecordingDemo );
   CommanderKeyMap.copyBind( moveMap, voiceCapture );
   CommanderKeyMap.bindCmd( keyboard, escape, "", "toggleCommanderMap( true );" );

   // grab help key from movemap
   if(!bindAction( moveMap, toggleHelpGui, false, toggleCmdMapHelpGui ))
      CommanderKeyMap.bind( keyboard, F1, toggleCmdMapHelpGui );

   // Bind the command assignment/response keys as well:
   CommanderKeyMap.copyBind( moveMap, toggleTaskListDlg );
   CommanderKeyMap.copyBind( moveMap, fnAcceptTask );
   CommanderKeyMap.copyBind( moveMap, fnDeclineTask );
   CommanderKeyMap.copyBind( moveMap, fnTaskCompleted );
   CommanderKeyMap.copyBind( moveMap, fnResetTaskList );

   // button shortcuts
   CommanderKeyMap.bindCmd( keyboard, 1, "toggleAction(CMDPlayersButton);", "" );
   CommanderKeyMap.bindCmd( keyboard, 2, "toggleAction(CMDTacticalButton);", "" );
   CommanderKeyMap.bindCmd( keyboard, 3, "toggleAction(CMDDeployedTacticalButton);", "" );
   CommanderKeyMap.bindCmd( keyboard, 4, "toggleAction(CMDMiscButton);", "" );
   CommanderKeyMap.bindCmd( keyboard, 5, "toggleAction(CMDDeployedMiscButton);", "" );
   CommanderKeyMap.bindCmd( keyboard, 6, "toggleAction(CMDWaypointsButton);", "" );
   CommanderKeyMap.bindCmd( keyboard, 7, "toggleAction(CMDObjectivesButton);", "" );

   // bottom buttons
   CommanderKeyMap.bindCmd( keyboard, w, "toggleAction(CMDShowSensorsButton);", "" );
   CommanderKeyMap.bindCmd( keyboard, space, "cycleMouseMode();", "" );
   CommanderKeyMap.bindCmd( keyboard, q, "toggleAction(CMDCenterButton);", "" );
   CommanderKeyMap.bindCmd( keyboard, t, "toggleAction(CMDTextButton);", "" );
   CommanderKeyMap.bindCmd( keyboard, b, "toggleAction(CMDCameraButton);", "" );

   // camera control (always arrows)
   CommanderKeyMap.bindCmd( keyboard, left, "CommanderMap.cameraMove(left, true);", "commanderMap.cameraMove(left, false);" );
   CommanderKeyMap.bindCmd( keyboard, right, "CommanderMap.cameraMove(right, true);", "commanderMap.cameraMove(right, false);" );
   CommanderKeyMap.bindCmd( keyboard, up, "CommanderMap.cameraMove(up, true);", "commanderMap.cameraMove(up, false);" );
   CommanderKeyMap.bindCmd( keyboard, down, "CommanderMap.cameraMove(down, true);", "commanderMap.cameraMove(down, false);" );
   CommanderKeyMap.bindCmd( keyboard, numpadadd, "CommanderMap.cameraMove(in, true);", "commanderMap.cameraMove(in, false);" );
   CommanderKeyMap.bindCmd( keyboard, numpadminus, "CommanderMap.cameraMove(out, true);", "commanderMap.cameraMove(out, false);" );

   CommanderKeyMap.bindCmd( keyboard, a, "CommanderMap.cameraMove(in, true);", "commanderMap.cameraMove(in, false);" );
   CommanderKeyMap.bindCmd( keyboard, z, "CommanderMap.cameraMove(out, true);", "commanderMap.cameraMove(out, false);" );

   // steal the movement keys? (more likely than others to be a duplicate binding)
   if($CommanderMap::useMovementKeys)
   {
      bindAction( moveMap, moveleft, true, "CommanderMap.cameraMove(left, true);", "commanderMap.cameraMove(left, false);" );
      bindAction( moveMap, moveright, true, "CommanderMap.cameraMove(right, true);", "commanderMap.cameraMove(right, false);" );
      bindAction( moveMap, moveforward, true, "CommanderMap.cameraMove(up, true);", "commanderMap.cameraMove(up, false);" );
      bindAction( moveMap, movebackward, true, "CommanderMap.cameraMove(down, true);", "commanderMap.cameraMove(down, false);" );
   }
   else
   {
      CommanderKeyMap.bindCmd( keyboard, s, "CommanderMap.cameraMove(left, true);", "commanderMap.cameraMove(left, false);" );
      CommanderKeyMap.bindCmd( keyboard, f, "CommanderMap.cameraMove(right, true);", "commanderMap.cameraMove(right, false);" );
      CommanderKeyMap.bindCmd( keyboard, e, "CommanderMap.cameraMove(up, true);", "commanderMap.cameraMove(up, false);" );
      CommanderKeyMap.bindCmd( keyboard, d, "CommanderMap.cameraMove(down, true);", "commanderMap.cameraMove(down, false);" );
   }
}

//--------------------------------------------------------------------------
// Default Icons:
new CommanderIconData(CMDDefaultIcon)
{
   selectImage = "animation base_select true true looping 100";
   hilightImage = "animation base_select true true flipflop 100";
};

new CommanderIconData(CMDAssignedTaskIcon)
{
   baseImage = "static diamond_not_selected true true";
   selectImage = "animation assigned_task_anim false true looping 100";
   hilightImage = "animation assigned_task_anim false true looping 100";
};

new CommanderIconData(CMDPotentialTaskIcon)
{
   baseImage = "static diamond_not_selected true true";
   selectImage = "animation assigned_task_anim false true looping 100";
   hilightImage = "animation assigned_task_anim false true looping 100";
};

new CommanderIconData(CMDWaypointIcon)
{
   baseImage = "animation waypoint_anim false false looping 100";
};

//--------------------------------------------------------------------------
// CommanderMapGui:
//--------------------------------------------------------------------------
function clientCmdResetCommandMap()
{
   CommanderMapGui.reset();
}

function clientCmdScopeCommanderMap(%scope)
{
   if(!isPlayingDemo())
      return;

   if(%scope)
   {
      CommanderMap.openAllCategories();
      CommanderMapGui.open();
   }
   else
      CommanderMapGui.close();
}

function CommanderMapGui::onWake(%this)
{
   clientCmdControlObjectReset();

   commandToServer('ScopeCommanderMap', true);

   createCommanderKeyMap();
   CommanderKeyMap.push();

   if ( $HudHandle[CommandScreen] )
      alxStop( $HudHandle[CommandScreen] );
   alxPlay(CommandMapActivateSound, 0, 0, 0);
   $HudHandle[CommandScreen] = alxPlay(CommandMapHumSound, 0, 0, 0);

   CMDTextButton.setValue(CommanderMap.renderText);

   // follow the player the first time
   if(%this.firstWake)
   {
      CommanderMap.selectControlObject();
      CommanderMap.followLastSelected();
      %this.firstWake = false;
   }

   if(CommanderTV.open)
      CommanderTV.watchTarget(CommanderTV.target);

   // chat hud dialog
   Canvas.pushDialog(MainChatHud);
   chatHud.attach(HudMessageVector);

   %this.open = true;
}

function CommanderMapGui::onSleep(%this)
{
   %this.open = false;

   commandToServer('ScopeCommanderMap', false);

   if(CMContextPopup.visible == true)
      CMContextPopup.reset();

   CommanderKeyMap.pop();
   Canvas.popDialog(MainChatHud);

   alxStop($HudHandle[CommandScreen]);
   alxPlay(CommandMapDeactivateSound, 0, 0, 0);
   $HudHandle[CommandScreen] = "";

   // will reset the control object on this client.. should only be sent
   // if this gui is being removed outside of CommanderMapGui::close()
   if(CommanderTV.open && CommanderTV.attached)
      commandToServer('AttachCommanderCamera', -1);

   //always set the cursor back to an arrow when you leave...
   Canvas.setCursor(CMDCursorArrow);
}

function CommanderMapGui::open(%this)
{
   if(%this.open)
      return;

	commandToServer('SetPDAPose', true);
   Canvas.setContent(%this);
}

function CommanderMapGui::close(%this)
{
   if(!%this.open)
      return;

   // only need to have control object reset if still attached to an object
//   if(CommanderTV.open && CommanderTV.attached)
//   {
      commandToServer('ResetControlObject');
      
      // reset the attached state since we will not be getting an attached response
      CommanderTV.attached = false;
//   }
//   else
//      clientCmdControlObjectReset();

	commandToServer('SetPDAPose', false);
}

function CommanderMapGui::toggle(%this)
{
   if(%this.open)
      %this.close();
   else
      %this.open();
}

function CommanderMapGui::onAdd(%this)
{
   %this.open = false;

   new GuiControl(CMContextPopupDlg)
   {
      profile = "GuiModelessDialogProfile";
      horizSizing = "width";
      vertSizing = "height";
      position = "0 0";
      extent = "640 480";
      minExtent = "8 8";
      visible = "1";
      setFirstResponder = "0";
      modal = "1";
      
      new GuiCommanderMapPopupMenu(CMContextPopup)   
      {
         profile = "CommanderPopupProfile";
         position = "0 0";
         extent = "0 0";
         minExtent = "0 0";
         maxPopupHeight = "200";
      };
   };

   CMContextPopup.numEntries = 0;
   CMContextPopup.actionMap = -1;
   CMContextPopup.focusedEntry = -1;
   CMContextPopup.visible = false;
   CMContextPopup.target = -1;
}

function CommanderMapGui::reset(%this)
{
   clientCmdControlObjectReset();
   CommanderMap.openAllCategories();
   CommanderMap.resetCamera();
   CommanderTV.watchTarget(-1);
   
   // remove all tasks and clean task list
   clientCmdResetTaskList();

   // reset waypoints
   if(isObject($ClientWaypoints))
      $ClientWaypoints.delete();

   // this can be called when not connected to a server
   if(isObject(ServerConnection))
   {
      $ClientWaypoints = new SimGroup();
      ServerConnection.add($ClientWaypoints);
   }

   %this.firstWake = true;
   CommanderTree.currentWaypointID = 0;
}

function CommanderMapGui::openCameraControl(%this, %open)
{
   %step = getWord(CommanderTV.extent, 1);
   %x = getWord(CommanderTreeContainer.position, 0);
   %y = getWord(CommanderTreeContainer.position, 1);
   %w = getWord(CommanderTreeContainer.extent, 0);
   %h = getWord(CommanderTreeContainer.extent, 1);

   if(%open)
      %h = %h - %step;
   else
      %h = %h + %step;
   
   CommanderTreeContainer.resize(%x, %y, %w, %h);
   CommanderTV.setVisible(%open);

   CommanderTV.open = %open;
   CommanderTV.watchTarget(CommanderTV.target);

   if(!CommanderTV.open)
      commandToServer('AttachCommanderCamera', -1);
}

//--------------------------------------------------------------------------
// CMContextPopup:
//--------------------------------------------------------------------------
function CMContextPopup::reset(%this)
{
   if(%this.actionMap != -1)
   {
      %this.actionMap.pop();
      %this.actionMap.delete();
   }

   for(%i = 0; %i < %this.numEntries; %i++)
   {
      %this.entryKeys[%i] = "";
      %this.entryCommands[%i] = "";
   }
      
   %this.visible = false;
   %this.numEntries = 0;
   %this.actionMap = -1;
   if(%this.focusedEntry != -1)
      %this.focusedEntry.lockFocus(false);
   %this.focusedEntry = -1;

   %this.forceClose();
   Canvas.popDialog(CMContextPopupDlg);

   // need to delete the target if it was not used
   if(isObject(%this.target))
   {
      if(%this.target.getTargetId() != -1)
         %this.target.delete();
      %this.target = -1;
   }
}

function CMContextPopup::display(%this)
{
   if(%this.numEntries == 0)
      return;

   %this.actionMap = new ActionMap();

   for(%i = 0; %i < %this.numEntries; %i++)
      if(%this.entryKeys[%i] !$= "")
         %this.actionMap.bindCmd(keyboard, %this.entryKeys[%i], "", %this @ ".onKeySelect(" @ %i @ ");");

   %this.actionMap.bindCmd(keyboard, escape, "", %this @ ".reset();");
   %this.actionMap.push();

   if(%this.focusedEntry != -1)
      %this.focusedEntry.lockFocus(true);
   %this.visible = true;

   Canvas.pushDialog(CMContextPopupDlg);
   %this.forceOnAction();
}

function CMContextPopup::addEntry(%this, %key, %text, %command)
{
   %idx = %this.numEntries;
   %this.entryKeys[%idx] = %key;
   %this.entryCommands[%idx] = %command;
   %this.numEntries++;

   %this.add(%text, %idx);
}

function CMContextPopup::onKeySelect(%this, %index)
{
   %this.onSelect(%index, %this.getTextById(%index));
}

function CMContextPopup::onSelect(%this, %index, %value)
{
   CommanderTree.processCommand(%this.entryCommands[%index], %this.target, %this.typeTag);
   %this.reset();
}

function CMContextPopup::onCancel( %this )
{
   %this.reset();
}

//------------------------------------------------------------------------------
// CommanderTree:
//------------------------------------------------------------------------------
function CommanderTree::onAdd(%this)
{
   %this.headerHeight = 20;
   %this.entryHeight = 20;

   %this.reset();

   %this.addCategory("Clients",     "Teammates",         "clients");
   %this.addCategory("Tactical",    "Tactical Assets",   "targets");
   %this.addCategory("DTactical",   "Deployed Tactical", "targets");
   %this.addCategory("Support",     "Support Assets",    "targets");
   %this.addCategory("DSupport",    "Deployed Support",  "targets");
   %this.addCategory("Waypoints",   "Waypoints",         "waypoints");
   %this.addCategory("Objectives",  "Objectives",        "targets");

   // targetType entries use registered info if no ShapeBaseData exists
   %this.registerEntryType("Clients", getTag('_ClientConnection'), false, "commander/MiniIcons/com_player_grey", "255 255 255");
   %this.registerEntryType("Waypoints", $CMD_WAYPOINTTYPEID, false, "commander/MiniIcons/com_waypoint_grey", "0 255 0");
   %this.registerEntryType("Waypoints", $CMD_ASSIGNEDTASKTYPEID, false, "commander/MiniIcons/com_waypoint_grey", "0 0 255");

//   %this.registerEntryType("Waypoints", $CMD_POTENTIALTASKTYPEID, false, "commander/MiniIcons/com_waypoint_grey", "255 255 0");
}

function CommanderTree::onCategoryOpen(%this, %category, %open)
{
   switch$ (%category)
   {
      case "Clients":
         CMDPlayersButton.setValue(%open);
      case "Tactical":
         CMDTacticalButton.setValue(%open);
      case "DTactical":
         CMDDeployedTacticalButton.setValue(%open);
      case "Support":
         CMDMiscButton.setValue(%open);
      case "DSupport":
         CMDDeployedMiscButton.setValue(%open);
      case "Waypoints":
         CMDWaypointsButton.setValue(%open);
      case "Objectives":
         CMDObjectivesButton.setValue(%open);
   }
}

function CommanderTree::controlObject(%this, %targetId)
{
   commandToServer('ControlObject', %targetId);
}

//------------------------------------------------------------------------------
// CommanderMap:
//------------------------------------------------------------------------------
function GuiCommanderMap::onAdd(%this)
{
   %this.setMouseMode(select);
   %this.setTargetTypeVisible($CMD_POTENTIALTASKTYPEID, true);
   %this.setTargetTypeVisible($CMD_ASSIGNEDTASKTYPEID, true);
}

function GuiCommanderMap::onSelect(%this, %targetId, %nameTag, %typeTag, %select)
{
   if(%select)
   {
      if(CommanderTV.target != %targetId)
         CommanderTV.watchTarget(%targetId);
   }
   else
      CommanderTV.watchTarget(-1);
}

function GuiCommanderMap::openCategory(%this, %ctrl, %name, %open)
{
   %ctrl.setValue(%open);
   CommanderTree.openCategory(%name, %open);
}

function GuiCommanderMap::openAllCategories(%this)
{
   %this.openCategory(CMDPlayersButton,            "Clients",     1);
   %this.openCategory(CMDTacticalButton,           "Tactical",    1);
   %this.openCategory(CMDDeployedTacticalButton,   "DTactical",    1);
   %this.openCategory(CMDMiscButton,               "Support",     1);
   %this.openCategory(CMDDeployedMiscButton,       "DSupport",     1);
   %this.openCategory(CMDWaypointsButton,          "Waypoints",   1);
   %this.openCategory(CMDObjectivesButton,         "Objectives",  1);
}

//------------------------------------------------------------------------------
// Issuing commands
//------------------------------------------------------------------------------
// misc. tasks (sensor group -1 is considered friendly with these)
$CommandTask['PotentialTask', 0, text]          = "\c1A\crccept";
$CommandTask['PotentialTask', 0, tag]           = 'TaskAccepted';
$CommandTask['PotentialTask', 0, hotkey]        = "a";
$CommandTask['PotentialTask', 1, text]          = "\c1D\crecline";
$CommandTask['PotentialTask', 1, tag]           = 'TaskDeclined';
$CommandTask['PotentialTask', 1, hotkey]        = "d";

$CommandTask['AssignedTask', 0, text]           = "\c1C\crompleted";
$CommandTask['AssignedTask', 0, tag]            = 'TaskCompleted';
$CommandTask['AssignedTask', 0, hotkey]         = "c";
$CommandTask['AssignedTask', 1, text]           = "\c1R\cremove";
$CommandTask['AssignedTask', 1, tag]            = 'TaskRemoved';
$CommandTask['AssignedTask', 1, hotkey]         = "d";

$CommandTask['Location', 0, text]               = "\c1D\crefend";
$CommandTask['Location', 0, tag]                = 'DefendLocation';
$CommandTask['Location', 0, hotkey]             = "d";
$CommandTask['Location', 1, text]               = "\c1M\creet (at)";
$CommandTask['Location', 1, tag]                = 'MeetLocation';
$CommandTask['Location', 1, hotkey]             = "m";
$CommandTask['Location', 2, text]               = "\c1B\cromb (at)";
$CommandTask['Location', 2, tag]                = 'BombLocation';
$CommandTask['Location', 2, hotkey]             = "b";
$CommandTask['Location', 3, text]               = "\c1A\crttack";
$CommandTask['Location', 3, tag]                = 'AttackLocation';
$CommandTask['Location', 3, hotkey]             = "a";
$CommandTask['Location', 4, text]               = "Deploy \c1I\crnventory";
$CommandTask['Location', 4, tag]                = 'DeployEquipment';
$CommandTask['Location', 4, hotkey]             = "i";
$CommandTask['Location', 5, text]               = "Deploy \c1T\crurrets";
$CommandTask['Location', 5, tag]                = 'DeployTurret';
$CommandTask['Location', 5, hotkey]             = "t";
$CommandTask['Location', 6, text]               = "Deploy \c1S\crensors";
$CommandTask['Location', 6, tag]                = 'DeploySensor';
$CommandTask['Location', 6, hotkey]             = "s";
$CommandTask['Location', 7, text]               = "Create \c1W\craypoint";
$CommandTask['Location', 7, tag]                = 'CreateWayPoint';
$CommandTask['Location', 7, hotkey]             = "w";

$CommandTask['Waypoint', 0, text]               = "\c1D\crelete waypoint";
$CommandTask['Waypoint', 0, tag]                = 'DeleteWayPoint';
$CommandTask['Waypoint', 0, hotkey]             = "d";

// object tasks
$CommandTask['Player', 0, text]                 = "\c1E\crscort";
$CommandTask['Player', 0, tag]                  = 'EscortPlayer';
$CommandTask['Player', 0, hotkey]               = "e";
$CommandTask['Player', 1, text]                 = "\c1R\crepair";
$CommandTask['Player', 1, tag]                  = 'RepairPlayer';
$CommandTask['Player', 1, hotkey]               = "r";
$CommandTask['Player', 2, text]                 = "\c1A\crttack";
$CommandTask['Player', 2, tag]                  = 'AttackPlayer';
$CommandTask['Player', 2, hotkey]               = "a";
$CommandTask['Player', 2, enemy]                = true;

$CommandTask['Flag', 0, text]                   = "\c1D\crefend";
$CommandTask['Flag', 0, tag]                    = 'DefendFlag';
$CommandTask['Flag', 0, hotkey]                 = "d";
$CommandTask['Flag', 1, text]                   = "\c1R\creturn";
$CommandTask['Flag', 1, tag]                    = 'ReturnFlag';
$CommandTask['Flag', 1, hotkey]                 = "r";
$CommandTask['Flag', 2, text]                   = "\c1C\crapture";
$CommandTask['Flag', 2, tag]                    = 'CaptureFlag';
$CommandTask['Flag', 2, hotkey]                 = "c";
$CommandTask['Flag', 2, enemy]                  = true;

$CommandTask['Objective', 0, text]              = "\c1C\crapture";
$CommandTask['Objective', 0, tag]               = 'CaptureObjective';
$CommandTask['Objective', 0, hotkey]            = "c";
$CommandTask['Objective', 1, text]              = "\c1D\crefend";
$CommandTask['Objective', 1, tag]               = 'DefendObjective';
$CommandTask['Objective', 1, hotkey]            = "d";

$CommandTask['Object', 0, text]                 = "\c1R\crepair";
$CommandTask['Object', 0, tag]                  = 'RepairObject';
$CommandTask['Object', 0, hotkey]               = "r";
$CommandTask['Object', 1, text]                 = "\c1D\crefend";
$CommandTask['Object', 1, tag]                  = 'DefendObject';
$CommandTask['Object', 1, hotkey]               = "d";
$CommandTask['Object', 2, text]                 = "\c1A\crttack";
$CommandTask['Object', 2, tag]                  = 'AttackObject';
$CommandTask['Object', 2, hotkey]               = "a";
$CommandTask['Object', 2, enemy]                = true;
$CommandTask['Object', 3, text]                 = "\c1L\craze";
$CommandTask['Object', 3, tag]                  = 'LazeObject';
$CommandTask['Object', 3, hotkey]               = "l";
$CommandTask['Object', 3, enemy]                = true;
$CommandTask['Object', 4, text]                 = "\c1M\crortar";
$CommandTask['Object', 4, tag]                  = 'MortarObject';
$CommandTask['Object', 4, hotkey]               = "m";
$CommandTask['Object', 4, enemy]                = true;
$CommandTask['Object', 5, text]                 = "\c1B\cromb";
$CommandTask['Object', 5, tag]                  = 'BombObject';
$CommandTask['Object', 5, hotkey]               = "b";
$CommandTask['Object', 5, enemy]                = true;

function GuiCommanderMap::issueCommand(%this, %target, %typeTag, %nameTag, %sensorGroup, %mousePos)
{
   CMContextPopup.position = %mousePos;
   CMContextPopup.clear();
   
   CMContextPopup.target = %target;
   CMContextPopup.typeTag = %typeTag;
   CMContextPopup.nameTag = %nameTag;
   CMContextPopup.sensorGroup = %sensorGroup;
   
   %taskType = %this.getCommandType(%typeTag);
   if(%taskType $= "")
   {
      // script created target?
      if(%target.getTargetId() == -1)
         %target.delete();
      CMDContextPopup.target = -1;
      return;
   }

   %this.buildPopupCommands(%taskType, %sensorGroup);
   CMContextPopup.display();
}

function GuiCommanderMap::getCommandType(%this, %typeTag)
{
   // special case (waypoints, location, tasks...)
   if(%typeTag == $CMD_LOCATIONTYPEID)
      return('Location');
   else if(%typeTag == $CMD_WAYPOINTTYPEID)
      return('Waypoint');
   else if(%typeTag == $CMD_POTENTIALTASKTYPEID)
      return('PotentialTask');
   else if(%typeTag == $CMD_ASSIGNEDTASKTYPEID)
      return('AssignedTask');

   // the handled types here (default is 'Object')
   switch$(getTaggedString(%typeTag))
   {
      case "_ClientConnection":
         return('Player');
      case "Flag":
         return('Flag');
      case "Objective":
         return('Objective');
   }
   return('Object');
}

function GuiCommanderMap::buildPopupCommands(%this, %taskType, %sensorGroup)
{
   %enemy = (%sensorGroup != ServerConnection.getSensorGroup()) && (%sensorGroup != -1);
   for(%i = 0; $CommandTask[%taskType, %i, text] !$= ""; %i++)
   {
      if(%enemy == $CommandTask[%taskType, %i, enemy])
      {
         CMContextPopup.addEntry($CommandTask[%taskType, %i, hotkey],
                                 $CommandTask[%taskType, %i, text],
                                 $CommandTask[%taskType, %i, tag]);
      }
   }
}

//--------------------------------------------------------------------------
// Command processing
//--------------------------------------------------------------------------
function CommanderTree::processCommand(%this, %command, %target, %typeTag)
{
   switch$(getTaggedString(%command))
   {
      // waypoints: tree owns the waypoint targets
      case "CreateWayPoint":
         %name = "Waypoint " @ %this.currentWaypointID++;
         %target.createWaypoint(%name);
         %id = %target.getTargetId();
         if(%id != -1)
         {
            $ClientWaypoints.add(%target);
            CMContextPopup.target = -1;
         }
         return;

      case "DeleteWayPoint":
         %target.delete();
         CMContextPopup.target = -1;
         return;

      // tasks:
      case "TaskAccepted":
         clientAcceptTask(%target);
         return;

      case "TaskDeclined":
         clientDeclineTask(%target);
         return;

      case "TaskCompleted":
         clientTaskCompleted();
         return;

      case "TaskRemoved":
         %target.delete();
         CMContextPopup.target = -1;
         return;
   }

   %numClients = %this.getNumTargets("Clients");
   %numSelected = %this.getNumSelectedTargets("Clients");

   if((%numSelected == 0) || (%numSelected == %numClients))
      %team = true;
   else
      %team = false;

   %target.sendToServer();
   commandToServer('BuildClientTask', %command, %team);

   if(%team)
   {
      commandToServer('SendTaskToTeam');
   }
   else
   {
      for(%i = 0; %i < %numSelected; %i++)
      {
         %targetId = %this.getSelectedTarget("Clients", %i);
         commandToServer('SendTaskToClientTarget', %targetId);
      }
   }

   // delete target?
   if(%target.getTargetId() == -1)
   {
      CMContextPopup.target = -1;
      %target.delete();
   }
}

//------------------------------------------------------------------------------
function CommanderTV::watchTarget(%this, %targetId)
{
   if(%targetId < 0)
      %targetId = -1;

   if(%this.attached)
      commandToServer('AttachCommanderCamera', -1);

   %this.target = %targetId;

   if(%this.open && (%this.target != -1))
      commandToServer('AttachCommanderCamera', %this.target);
}

function clientCmdCameraAttachResponse(%attached)
{
   CommanderTV.attached = %attached;
}

//------------------------------------------------------------------------------
// CommanderTV control
//------------------------------------------------------------------------------
new ActionMap(CommanderTVControl);
CommanderTVControl.bind(mouse, xaxis, yaw);
CommanderTVControl.bind(mouse, yaxis, pitch);


function CommanderTV_ButtonPress(%val)
{
   if(%val)
   {
      CommanderTVControl.push();
      CursorOff();
   }
   else
   {
      CommanderTVControl.pop();
      GlobalActionMap.unbind(mouse, button0);
      
      if(CommanderMapGui.open)
      {
         CursorOn();
         Canvas.setCursor(CMDCursorArrow);
      }
   }
}

function CommanderTVScreen::onMouseEnter(%this, %mod, %pos, %count)
{
   GlobalActionMap.bind(mouse, button0, CommanderTV_ButtonPress);
}

function CommanderTVScreen::onMouseLeave(%this, %mod, %pos, %count)
{
   GlobalActionMap.unbind(mouse, button0);
}

//------------------------------------------------------------------------------
// Buttons: play button down sounds here so script onAction call plays sound as well
//------------------------------------------------------------------------------
// top buttons:
function CMDPlayersButton::onAction(%this)
{
   CommanderTree.openCategory("Clients", %this.getValue());
   alxPlay(sButtonDown, 0, 0, 0);
}

function CMDTacticalButton::onAction(%this)
{  
   CommanderTree.openCategory("Tactical", %this.getValue());
   alxPlay(sButtonDown, 0, 0, 0);
}

function CMDDeployedTacticalButton::onAction(%this)
{  
   CommanderTree.openCategory("DTactical", %this.getValue());
   alxPlay(sButtonDown, 0, 0, 0);
}

function CMDMiscButton::onAction(%this)
{
   CommanderTree.openCategory("Support", %this.getValue());
   alxPlay(sButtonDown, 0, 0, 0);
}

function CMDDeployedMiscButton::onAction(%this)
{
   CommanderTree.openCategory("DSupport", %this.getValue());
   alxPlay(sButtonDown, 0, 0, 0);
}

function CMDWaypointsButton::onAction(%this)
{
   CommanderTree.openCategory("Waypoints", %this.getValue());
   alxPlay(sButtonDown, 0, 0, 0);
}

function CMDObjectivesButton::onAction(%this)
{
   CommanderTree.openCategory("Objectives", %this.getValue());
   alxPlay(sButtonDown, 0, 0, 0);
}

// bottom buttons:
function CMDShowSensorsButton::onAction(%this)
{
   CommanderMap.renderSensors = %this.getValue();
   alxPlay(sButtonDown, 0, 0, 0);
}

// there should be, at most, one depressed mouse mode button
function setMouseMode(%mode)
{
   switch$(%mode)
   {
      case "select":
         CMDMoveSelectButton.setValue(false);
         CMDZoomButton.setValue(false);
      
      case "move":
         CMDMoveSelectButton.setValue(true);
         CMDZoomButton.setValue(false);
      
      case "zoom":
         CMDMoveSelectButton.setValue(false);
         CMDZoomButton.setValue(true);
   }

   CommanderMap.setMouseMode(%mode);
   alxPlay(sButtonDown, 0, 0, 0);
}

function cycleMouseMode()
{
   switch$(CommanderMap.getMouseMode())
   {
      case "select":
         setMouseMode("move");
      case "move":
         setMouseMode("zoom");
      case "zoom":
         setMouseMode("select");
   }
}
   
function CMDMoveSelectButton::onAction(%this)
{
   if(%this.getValue())
      setMouseMode(move);
   else
      setMouseMode(select);
}

function CMDZoomButton::onAction(%this)
{
   if(%this.getValue())
      setMouseMode(zoom);
   else
      setMouseMode(select);
}

function CMDCenterButton::onAction(%this)
{
   CommanderMap.followLastSelected();
   alxPlay(sButtonDown, 0, 0, 0);
}

function CMDTextButton::onAction(%this)
{
   CommanderMap.renderText = %this.getValue();
   alxPlay(sButtonDown, 0, 0, 0);
}

function CMDCameraButton::onAction(%this)
{
   CommanderMapGui.openCameraControl(%this.getValue());
   alxPlay(sButtonDown, 0, 0, 0);
}

//---------------------------------------------------------------------------
// - the server may be down and client will not be able to get out of this object
//   by using the escape key; so, schedule a timeout period to reset
$ServerResponseTimeout = 1500;

function processControlObjectEscape()
{
   if($ScheduledEscapeTask)
      return;
   
   $ScheduledEscapeTask = schedule($ServerResonseTimeout, 0, clientCmdControlObjectReset);
   commandToServer('ResetControlObject');
}

function clientCmdControlObjectResponse(%ack, %info)
{
   // if ack'd then %info is the tag for the object otherwise it is a decline message
   if(%ack == true)
   {
      new ActionMap(ControlActionMap);
      ControlActionMap.bindCmd(keyboard, escape, "processControlObjectEscape();", "");

      $PlayerIsControllingObject = true;
      clientCmdSetHudMode("Object", %info);

      // at this point, we are not attached to an object
      CommanderTV.attached = false;
      Canvas.setContent(PlayGui);
   }
   else
      addMessageHudLine("\c3Failed to control object: \cr" @ %info);
}

function clientCmdControlObjectReset()
{
   if($ScheduledEscapeTask)
   {
      cancel($ScheduledEscapeTask);
      $ScheduledEscapeTask = 0;
   }

   if(isObject(ControlActionMap))
      ControlActionMap.delete();

   if ($PlayerIsControllingObject)
   {
      $PlayerIsControllingObject = false;
      ClientCmdSetHudMode("Standard");
   }

   if(CommanderMapGui.open)
      Canvas.setContent(PlayGui);
}

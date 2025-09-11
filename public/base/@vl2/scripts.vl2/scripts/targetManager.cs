//--------------------------------------------------------------------------
// helper function for creating targets
function createTarget(%obj, %nameTag, %skinTag, %voiceTag, %typeTag, %sensorGroup, %voicePitch)
{
   if (%voicePitch $= "" || %voicePitch == 0)
      %voicePitch = 1.0;
   %data = (%obj.getType() & $TypeMasks::ShapeBaseObjectType) ? %obj.getDataBlock() : 0;
   %target = allocTarget(%nameTag, %skinTag, %voiceTag, %typeTag, %sensorGroup, %data, %voicePitch);

   %obj.setTarget(%target);
   return(%target);
}

//--------------------------------------------------------------------------
// useful for when a client switches teams or joins the game
function clientResetTargets(%client, %tasksOnly)
{
   if(%client.isAiControlled())
      return;

   // remove just tasks or everything?
   resetClientTargets(%client, %tasksOnly);

   // notify the client to cleanup the gui...
   commandToClient(%client, 'ResetTaskList');
}

//--------------------------------------------------------------------------
// useful at end of missions
function resetTargetManager()
{
   %count = ClientGroup.getCount();

   // clear the lookup table
   for(%cl = 0; %cl < %count; %cl++)
   {
      %client = ClientGroup.getObject(%cl);
      $TargetToClient[%client.target] = "";
   }

   // reset all the targets on all the connections
   resetTargets();

   // create targets for all the clients
   for(%cl = 0; %cl < %count; %cl++)
   {
      %client = ClientGroup.getObject(%cl);

      if(!%client.isAiControlled())
         commandToClient(%client, 'ResetTaskList');

      // reset the clients target and update the lookup table
      %client.target = allocClientTarget(%client, %client.name, %client.skin, %client.voiceTag, '_ClientConnection', 0, 0, %client.voicePitch);
   }
}  

//--------------------------------------------------------------------------
// wrap the client targets to maintain a lookup table on the server
function allocClientTarget(%client, %nameTag, %skinTag, %voiceTag, %typeTag, %sensorGroup, %datablock, %voicePitch)
{
   if (%voicePitch $= "" || %voicePitch == 0)
      %voicePitch = 1.0;
   echo("allocating client target - skin = " @ getTaggedString(%skinTag));
   %target = allocTarget(%nameTag, %skinTag, %voiceTag, %typeTag, %sensorGroup, %datablock, %voicePitch, %skinTag);

   // first bit is the triangle
   setTargetRenderMask(%target, (1 << $TargetInfo::HudRenderStart));

   $TargetToClient[%target] = %client;
   return(%target);
}

function freeClientTarget(%client)
{
   $TargetToClient[%client.target] = "";
   freeTarget(%client.target);
}

//--------------------------------------------------------------------------
function ClientTarget::onAdd(%this, %type)
{
   %this.client = TaskList.currentTaskClient;
   %this.AIObjective = TaskList.currentAIObjective;
   %this.team = TaskList.currentTaskIsTeam;
   %this.description = TaskList.currentTaskDescription;

   %player = $PlayerList[%this.client];
   %this.clientName = %player ? %player.name : "[Unknown]";

   switch$(%type)
   {
      case "AssignedTask":
         TaskList.currentTask = %this;
         %this.setText(%this.description);

      case "PotentialTask":
         // add to the task list and display a message
         TaskList.addTask(%this, %this.clientName, detag(%this.description));
         %this.setText(%this.description);
   }
}

function ClientTarget::onDie(%this, %type)
{
   // if this target is not removed from its current group then it will be 
   // deleted on return of this call
   switch$(%type)
   {
      case "AssignedTask": // let it die
         TaskList.currentTask = -1;

      case "PotentialTask":
         TaskList.handleDyingTask(%this);
   }
}

//--------------------------------------------------------------------------
// debug: useless if not compiled debug
//--------------------------------------------------------------------------
function displayTargetManagerInfo()
{
   if(!isObject(TargetManagerInfoDlg))
   {
      new GuiControl(TargetManagerInfoDlg)
      {
         profile = "GuiModelessDialogProfile";
         open = false;
   
         new GuiWindowCtrl(TargetManagerInfoWindow)
         {
            profile = "GuiWindowProfile";
            horizSizing = "right";
            vertSizing = "bottom";
            position = "0 100";
            extent = "600 300";
            canMove = true;
            canClose = true;
            resizeWidth = true;
            resizeHeight = true;
            canMinimize = true;
            canMaximize = true;
      
            new GuiScrollCtrl()
            {
               profile = "GuiScrollCtrlProfile";
               position = "4 20";
               extent = "592 276";
               hScrollBar = "alwaysOff";
               vScrollBar = "alwaysOn";
               horizSizing = "width";
               vertSizing = "height";
      
               new GuiScrollContentCtrl()
               {
                  profile = "GuiScrollContentProfile";
                  position = "0 0";
                  extent = "576 276";
                  horizSizing = "width";
                  vertSizing = "height";

                  new GuiTargetManagerListCtrl(TargetManagerInfo)
                  {
                     profile = "GuiTextArrayProfile";
                     position = "0 0";
                     extent = "10 10";
                     horizSizing = "width";
                     vertSizing = "height";
                     clipColumnText = true;
                  };
               };
            };
         };
      };
   }

   toggleTheWindow(true);
}

function toggleTheWindow(%val)
{
   if(!%val)
      return;

   if(TargetManagerInfoDlg.open)
      Canvas.popDialog(TargetManagerInfoDlg);
   else
      Canvas.pushDialog(TargetManagerInfoDlg, 98);
}

function toggleTheMouse(%val)
{
   if(!%val)
      return;
   toggleMouse();
}

function toggleTheClient(%val)
{
   if(!%val)
      return;

   TargetManagerInfo.serverTargets = !TargetManagerInfo.serverTargets;
   TargetManagerInfoDlg.updateWindowText();
}

function TargetManagerInfoDlg::updateWindowText()
{
   if(TargetManagerInfo.serverTargets)
      TargetManagerInfoWindow.setText("Target Manager Info: <SERVER>");
   else
      TargetManagerInfoWindow.setText("Target Manager Info: <CLIENT>");
}

function TargetManagerInfoDlg::onWake(%this)
{
   %this.open = true;
   TargetManagerInfo.columns = "0 20 120 200 240 280 320 360 420 480 530 580 630 680";

   GlobalActionMap.bind(keyboard, j, toggleTheWindow);
   GlobalActionMap.bind(keyboard, k, toggleTheMouse);
   GlobalActionMap.bind(keyboard, l, toggleTheClient);
   %this.updateWindowText();
}

function TargetManagerInfoDlg::onSleep(%this)
{
   %this.open = false;
   GlobalActionMap.unbind(keyboard, k);
   GlobalActionMap.unbind(keyboard, l);
}
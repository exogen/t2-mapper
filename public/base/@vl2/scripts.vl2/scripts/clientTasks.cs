//------------------------------------------------------------------------------
// Client tasks
//------------------------------------------------------------------------------
$MAX_OUTSTANDING_TASKS = 10;

function clientCmdResetTaskList()
{
   if((TaskList.currentTask != -1) && isObject(TaskList.currentTask))
   {
      TaskList.currentTask.delete();
      TaskList.currentTask = -1;
   }
   TaskList.currentTask = -1;

   TaskList.reset();
}

//--------------------------------------------------------------------------
function clientCmdTaskInfo(%client, %aiObjtive, %team, %description)
{
   // copy the info
   TaskList.currentTaskClient = %client;
   TaskList.currentAIObjective = %aiObjective;
   TaskList.currentTaskIsTeam = %team;
   TaskList.currentTaskDescription = detag(%description);
}

function clientAcceptTask(%task)
{
   %task.sendToServer();

   commandToServer('AcceptTask', %task.client, %task.AIObjective, %task.description);
   TaskList.removeTask(%task, true);

   //play the audio
   alxPlay(TaskAcceptedSound, 0, 0, 0);
}

function clientDeclineTask(%task)
{
   commandToServer('DeclineTask', %task.client, %task.description, %task.team);
   TaskList.removeTask(%task, false);

   //play the audio
   alxPlay(TaskDeclinedSound, 0, 0, 0);
}

function clientTaskCompleted()
{
   if((TaskList.currentTask != -1) && isObject(TaskList.currentTask))
   {
      commandToServer('CompletedTask', TaskList.currentTask.client, TaskList.currentTask.description);

      TaskList.currentTask.delete();
      TaskList.currentTask = -1;

      //play the audio
      alxPlay(TaskDeclinedSound, 0, 0, 0);
   }
}

//------------------------------------------------------------------------------
// HUD information
//------------------------------------------------------------------------------
function clientCmdPotentialTeamTask(%description)
{
   addMessageHudLine("\c2Team:\cr " @ detag(%description) @ ".");
}

function clientCmdPotentialTask(%from, %description)
{
   addMessageHudLine("\c3" @ detag(%from) @ ":\cr " @ detag(%description) @ ".");
}

function clientCmdTaskDeclined(%from, %description)
{
   addMessageHudLine(detag(%from) @ " refused your task '" @ detag(%description) @ "'.");
}

function clientCmdTaskAccepted(%from, %description)
{
   addMessageHudLine(detag(%from) @ " accepted your task '" @ detag(%description) @ "'.");
}

function clientCmdTaskCompleted(%from, %description)
{
   addMessageHudLine(detag(%from) @ " completed your task '" @ detag(%description) @ "'.");
}

function clientCmdAcceptedTask(%description)
{
   addMessageHudLine("\c3Your current task is:\cr " @ %description);
}

//------------------------------------------------------------------------------
function clientAcceptCurrentTask()
{
   %task = TaskList.getCurrentTask();
   if(%task != -1)
      clientAcceptTask(%task);
}

function clientDeclineCurrentTask()
{
   %task = TaskList.getCurrentTask();
   if(%task != -1)
      clientDeclineTask(%task);
}

//--------------------------------------------------------------------------
// TaskList:
//--------------------------------------------------------------------------
function TaskList::onAdd(%this)
{
   %this.ownedTasks = -1;
   %this.currentTask = -1;
   %this.reset();

   // install some chat callbacks
   installChatItemCallback('ChatCmdAcknowledged', clientAcceptCurrentTask);
   installChatItemCallback('ChatCmdCompleted', clientTaskCompleted);
   installChatItemCallback('ChatCmdDeclined', clientDeclineCurrentTask);
}

function TaskList::reset(%this)
{
   %this.currentTaskClient = -1;
   %this.currentAIObjective = -1;
   %this.currentTaskIsTeam = false;
   %this.currentTaskDescription = "";

   if((%this.ownedTasks != -1) && isObject(%this.ownedTasks))
      %this.ownedTasks.delete();

   %this.ownedTasks = new SimGroup();

   %this.currentIndex = 1;
   %this.clear();
}

function TaskList::onRemove(%this)
{
   if((%this.ownedTasks != -1) && isObject(%this.ownedTasks))
   %this.ownedTasks.delete();
}

function TaskList::handleDyingTask(%this, %task)
{
   %this.ownedTasks.add(%task);
}

//--------------------------------------------------------------------------
function TaskList::getLastTask(%this)
{
   %count = %this.rowCount();
   if(%count == 0)
      return(-1);
   return(%this.getRowId(%count - 1));
}

function TaskList::getCurrentTask(%this)
{
   if(%this.isVisible())
   {
      %id = %this.getSelectedId();
      if(%id != -1)
         return(%id);
   }
   
   return(%this.getLastTask());
}

function TaskList::addTask(%this, %task)
{
   // remove any duplicate...
   %count = %this.rowCount();
   for(%i = 0; %i < %count; %i++)
   {
      %oldTask = %this.getRowId(%i);
      if((%oldTask.client == %task.client) && (detag(%oldTask.description) $= detag(%task.description)))
      {
         %this.removeTask(%oldTask, false);
         break;
      }
   }
   
   // need to remove the oldest task?
   if(%this.rowCount() == $MAX_OUTSTANDING_TASKS)
      %this.removeTask(%this.getRowId(0), false);

   %this.addRow(%task, %task.clientName @ "\t" @ detag(%task.description), %this.rowCount());
}

function TaskList::removeTask(%this, %task, %close)
{
   %row = %this.getRowNumById(%task);
   if(%row == -1)
      return;

   %select = %this.getSelectedId() == %task;
   
   if(isObject(%task))
      %task.delete();
   %this.removeRow(%row);
   
   if(%select && (%this.rowCount() != 0))
   {
      if(%row == %this.rowCount())
         %row = %row - 1;
      %this.setSelectedRow(%row);
   }
   
   if(%close && %this.isVisible())
      showTaskHudDlg(false);
}

function TaskList::updateSelected(%this, %show)
{
   %task = %this.getSelectedId();
   if(%task == -1)
      return;

   if(%show)
   {
      %task.addPotentialTask();
      if(CommanderMapGui.open)
         CommanderMap.selectClientTarget(%task, true);
      else
         NavHud.keepClientTargetAlive(%task);
   }
   else
   {
      if(CommanderMapGui.open)
         CommanderMap.selectClientTarget(%task, false);
      else
         NavHud.keepClientTargetAlive(0);
   }
}

function TaskList::selectLatest(%this)
{
   %this.setSelectedRow(-1);
   %id = %this.getLastTask();
   if(%id == -1)
      return;
   
   %this.setSelectedById(%id);
   %this.updateSelected(true);
}

function TaskList::selectPrevious(%this)
{
   %id = %this.getSelectedId();
   if(%id == -1)
   {
      %this.selectLatest();
      return;
   }

   %row = %this.getRowNumById(%id);
   if(%row == 0)
      %row = %this.rowCount() - 1;
   else
      %row -= 1;
   %this.setSelectedRow(%row);
   %this.updateSelected(true);
}

function TaskList::selectNext(%this)
{
   %id = %this.getSelectedId();
   if(%id == -1)
   {
      %this.selectLatest();
      return;
   }
   
   %row = %this.getRowNumById(%id);
   if(%row == (%this.rowCount() - 1))
      %row = 0;
   else
      %row += 1;
   %this.setSelectedRow(%row);
   %this.updateSelected(true);
}

//--------------------------------------------------------------------------
function showTaskHudDlg(%show)
{
   if(%show)
   {
      if(!TaskHudDlg.isVisible())
      {
         TaskHudDlg.setVisible(true);
         Canvas.pushDialog(TaskHudDlg);
      }
   }
   else
   {
      if(TaskHudDlg.isVisible())
      {
         TaskHudDlg.setVisible(false);
         Canvas.popDialog(TaskHudDlg);
      }
   }
}

//--------------------------------------------------------------------------
// - toggle 'visible' so this, and other, controls can determine if it is up
function toggleTaskListDlg(%val)
{
   if(%val)
   {
      if(ChatMenuHudDlg.isVisible() || TaskHudDlg.isVisible())
         showTaskHudDlg(false);
      else
         showTaskHudDlg(true);
   }
}


new ActionMap(TaskHudMap);
TaskHudMap.bindCmd(keyboard, "up", "TaskList.selectPrevious();", "");
TaskHudMap.bindCmd(keyboard, "down", "TaskList.selectNext();", "");
TaskHudMap.bindCmd(keyboard, "escape", "if(TaskHudDlg.isVisible()) showTaskHudDlg(false);", "");

function TaskHudDlg::onWake(%this)
{
   TaskHudMap.push();
   TaskList.setVisible(true);
   TaskList.selectLatest();
}

function TaskHudDlg::onSleep(%this)
{
   TaskHudMap.pop();
   TaskList.setVisible(false);
   TaskList.updateSelected(false);

   //make sure the action maps are still pushed in the correct order...
   updateActionMaps();
}
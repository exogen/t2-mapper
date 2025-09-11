//--------------------------------------------------------------------------
// Trigger functions and datablocks...
// 
// 
//--------------------------------------------------------------------------

datablock TriggerData(defaultTrigger)
{
   tickPeriodMS = 200;
};

datablock TriggerData(hairTrigger)
{
   tickPeriodMS = 30;
};

datablock TriggerData(slowTrigger)
{
   tickPeriodMS = 1000;
};

datablock TriggerData(stationTrigger)
{
   tickPeriodMS = 30;
};

datablock TriggerData(gameTrigger)
{
   tickPeriodMS = 50;
};

datablock TriggerData(markerTrigger)
{
   tickPeriodMS = 100000;
};
//--------------------------------------------------------------------------
datablock TriggerData(defaultTeamTrigger)
{
   tickPeriodMS = 200;
};

function defaultTeamTrigger::onEnterTrigger(%this, %trigger, %triggeringObject)
{
   %group = %trigger.getGroup();
   if (!%group)
      return;
   for (%i = 0; %i < %group.getCount(); %i++) {
      %object = %group.getObject(%i);
      if (%triggeringObject.team == %trigger.team)
         %object.onTrigger(%trigger, 1);
   }
}

function defaultTeamTrigger::onLeaveTrigger(%this, %trigger, %triggeringObject)
{
   %group = %trigger.getGroup();
   if (!%group)
      return;
   for (%i = 0; %i < %group.getCount(); %i++) {
      %object = %group.getObject(%i);
      if (%triggeringObject.team == %trigger.team)
         %object.onTrigger(%trigger, 0);
   }
}

function defaultTeamTrigger::onTickTrigger(%this, %trigger)
{
   %group = %trigger.getGroup();
   if (!%group)
      return;
   %tick = false;
   for (%i = 0; %i < %trigger.getNumObjects(); %i++) {
      if (%trigger.getObject(%i).team == %trigger.team) {
         %tick = true;
         break;
      }
   }

   if (%tick == true) {
      for (%i = 0; %i < %group.getCount(); %i++) {
         %object = %group.getObject(%i);
         %object.onTriggerTick(%trigger);
      }
   }
}

//******************************************************************************
//*   Game Trigger  -  Functions                                               *
//******************************************************************************

/// -Trigger- //////////////////////////////////////////////////////////////////
//Function -- onEnterTrigger (%data, %obj, %colObj)
//                %data = Trigger Data Block 
//                %obj = Trigger Object 
//                %colObj = Object that collided with the trigger
//Decription -- Called when trigger has been triggered 
////////////////////////////////////////////////////////////////////////////////
function gameTrigger::onEnterTrigger(%data, %obj, %colObj)  
{
   Game.onEnterTrigger(%obj.name, %data, %obj, %colObj);
}

/// -Trigger- //////////////////////////////////////////////////////////////////
//Function -- onLeaveTrigger (%data, %obj, %colObj)
//                %data = Trigger Data Block 
//                %obj = Trigger Object 
//                %colObj = Object that collided with the trigger
//Decription -- Called when trigger has been untriggered
////////////////////////////////////////////////////////////////////////////////
function gameTrigger::onLeaveTrigger(%data, %obj, %colObj)
{
   Game.onLeaveTrigger(%obj.name, %data, %obj, %colObj);
}

/// -Trigger- //////////////////////////////////////////////////////////////////
//Function -- onTickTrigger(%data, %obj)
//                %data = Trigger Data Block 
//                %obj = Trigger Object 
//Decription -- Called every tick if triggered
////////////////////////////////////////////////////////////////////////////////
function gameTrigger::onTickTrigger(%data, %obj)
{
   Game.onTickTrigger(%obj.name, %data, %obj);
}
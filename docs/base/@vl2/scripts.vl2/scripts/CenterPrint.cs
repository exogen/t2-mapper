// CenterPrint Methods
//-------------------------------------------------------------------------------------------------------

$centerPrintActive = 0;
$bottomPrintActive = 0;

$CenterPrintSizes[1] = 20;
$CenterPrintSizes[2] = 36;
$CenterPrintSizes[3] = 56;

function centerPrintAll( %message, %time, %lines )
{
   if( %lines $= "" || ((%lines > 3) || (%lines < 1)) )
      %lines = 1;
   
   %count = ClientGroup.getCount();
   for (%i = 0; %i < %count; %i++)
	{
		%cl = ClientGroup.getObject(%i);
      if( !%cl.isAIControlled() )
         commandToClient( %cl, 'centerPrint', %message, %time, %lines );
   }
}

function bottomPrintAll( %message, %time, %lines )
{
   if( %lines $= "" || ((%lines > 3) || (%lines < 1)) )
      %lines = 1;
   
   %count = ClientGroup.getCount();
	for (%i = 0; %i < %count; %i++)
	{
		%cl = ClientGroup.getObject(%i);
      if( !%cl.isAIControlled() )
         commandToClient( %cl, 'bottomPrint', %message, %time, %lines );
   }
}

//-------------------------------------------------------------------------------------------------------

function centerPrint( %client, %message, %time, %lines )
{
   if( %lines $= "" || ((%lines > 3) || (%lines < 1)) )
      %lines = 1;
      
   
   commandToClient( %client, 'CenterPrint', %message, %time, %lines );
}

function bottomPrint( %client, %message, %time, %lines )
{
   if( %lines $= "" || ((%lines > 3) || (%lines < 1)) )
      %lines = 1;

   commandToClient( %client, 'BottomPrint', %message, %time, %lines );
}

//-------------------------------------------------------------------------------------------------------

function clearCenterPrint( %client )
{
   commandToClient( %client, 'ClearCenterPrint');
}

function clearBottomPrint( %client )
{
   commandToClient( %client, 'ClearBottomPrint');
}

//-------------------------------------------------------------------------------------------------------

function clearCenterPrintAll()
{
	%count = ClientGroup.getCount();
	for (%i = 0; %i < %count; %i++)
	{
		%cl = ClientGroup.getObject(%i);
      if( !%cl.isAIControlled() )
         commandToClient( %cl, 'ClearCenterPrint');
   }
}

function clearBottomPrintAll()
{
	%count = ClientGroup.getCount();
	for (%i = 0; %i < %count; %i++)
	{
		%cl = ClientGroup.getObject(%i);
      if( !%cl.isAIControlled() )
         commandToClient( %cl, 'ClearBottomPrint');
   }
}

//-------------------------------------------------------------------------------------------------------

function clientCmdCenterPrint( %message, %time, %lines ) // time is specified in seconds
{
   // if centerprint already visible, reset text and time.
   if($centerPrintActive)
   {   
      CenterPrintText.setText( "<just:center>" @ %message );
      if( centerPrintDlg.removePrint !$= "")
      {
         cancel(centerPrintDlg.removePrint);
      }
      if(%time > 0)
         centerPrintDlg.removePrint = schedule( ( %time * 1000 ), 0, "clientCmdClearCenterPrint" );
      
      // were done.
      return;   
   }   
   
   
   CenterPrintDlg.visible = 1;
   $centerPrintActive = 1;
   CenterPrintText.setText( "<just:center>" @ %message );
   CenterPrintDlg.extent = firstWord(CenterPrintDlg.extent) @ " " @ $CenterPrintSizes[%lines];
   
   if(%time > 0)
      centerPrintDlg.removePrint = schedule( ( %time * 1000 ), 0, "clientCmdClearCenterPrint" );
}

function clientCmdBottomPrint( %message, %time, %lines ) // time is specified in seconds
{
   // if bottomprint already visible, reset text and time.
   if($bottomPrintActive)
   {   
      if( bottomPrintDlg.removePrint !$= "")
      {
         cancel(bottomPrintDlg.removePrint);
      }
         
      bottomPrintText.setText( "<just:center>" @ %message );
      bottomPrintDlg.extent = firstWord(bottomPrintDlg.extent) @ " " @ $CenterPrintSizes[%lines];
         
      if(%time > 0)
         bottomPrintDlg.removePrint = schedule( ( %time * 1000 ), 0, "clientCmdClearbottomPrint" );
      
      // were done.
      return;   
   }   
   
   bottomPrintDlg.setVisible(true);
   $bottomPrintActive = 1;
   bottomPrintText.setText( "<just:center>" @ %message );
   bottomPrintDlg.extent = firstWord(bottomPrintDlg.extent) @ " " @ $CenterPrintSizes[%lines];
   
   if(%time > 0)
   {   
      bottomPrintDlg.removePrint = schedule( ( %time * 1000 ), 0, "clientCmdClearbottomPrint" );
   }
}

function BottomPrintText::onResize(%this, %width, %height)
{
   %this.position = "0 0";
}

function CenterPrintText::onResize(%this, %width, %height)
{
   %this.position = "0 0";
}

//-------------------------------------------------------------------------------------------------------

function clientCmdClearCenterPrint()
{
   $centerPrintActive = 0;
   CenterPrintDlg.visible = 0;
   
   CenterPrintDlg.removePrint = "";
}

function clientCmdClearBottomPrint()
{
   $bottomPrintActive = 0;
   BottomPrintDlg.visible = 0;
   
   BottomPrintDlg.removePrint = "";
}

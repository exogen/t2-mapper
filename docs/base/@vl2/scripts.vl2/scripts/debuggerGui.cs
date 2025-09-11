
// debugger is just a simple TCP object
if (!isObject(TCPDebugger))
	new TCPObject(TCPDebugger);

//--------------------------------------------------------------
// TCP function defs
//--------------------------------------------------------------

function DebuggerConsoleView::print(%this, %line)
{
   %row = %this.addRow(0, %line);
   %this.scrollVisible(%row);
}

function TCPDebugger::onLine(%this, %line)
{
   echo("Got line=>" @ %line);
   %cmd = firstWord(%line);
   %rest = restWords(%line);
   
   if(%cmd $= "PASS")
      %this.handlePass(%rest);
   else if(%cmd $= "COUT")
      %this.handleLineOut(%rest);
   else if(%cmd $= "FILELISTOUT")
      %this.handleFileList(%rest);
   else if(%cmd $= "BREAKLISTOUT")
      %this.handleBreakList(%rest);
   else if(%cmd $= "BREAK")
      %this.handleBreak(%rest);
   else if(%cmd $= "RUNNING")
      %this.handleRunning();
   else if(%cmd $= "EVALOUT")
      %this.handleEvalOut(%rest);
   else if(%cmd $= "OBJTAGLISTOUT")
      %this.handleObjTagList(%rest);
   else
      %this.handleError(%line);   
}

//--------------------------------------------------------------
// handlers for messages from the server
//--------------------------------------------------------------

function TCPDebugger::handlePass(%this, %message)
{
   if(%message $= "WrongPass")
   {
      DebuggerConsoleView.print("Disconnected - wrong password.");   
      %this.disconnect();
   }
   else if(%message $= "Connected.")
   {
      DebuggerConsoleView.print("Connected.");
      DebuggerStatus.setValue("CONNECTED");
      %this.send("FILELIST\r\n");
   }
}

function TCPDebugger::handleLineOut(%this, %line)
{
   DebuggerConsoleView.print(%line);
}

function TCPDebugger::handleFileList(%this, %line)
{
   DebuggerFilePopup.clear();
   %word = 0;
   while((%file = getWord(%line, %word)) !$= "")
   {
      %word++;
      DebuggerFilePopup.add(%file, %word);
   }
}

function TCPDebugger::handleBreakList(%this, %line)
{
   %file = getWord(%line, 0);
   if(%file != $DebuggerFile)
      return;
   %pairs = getWord(%line, 1);
   %curLine = 1;
   DebuggerFileView.clearBreakPositions();
   
	//set the possible break positions
   for(%i = 0; %i < %pairs; %i++)
   {
      %skip = getWord(%line, %i * 2 + 2);
      %breaks = getWord(%line, %i * 2 + 3);
      %curLine += %skip;
      for(%j = 0; %j < %breaks; %j++)
      {
         DebuggerFileView.setBreakPosition(%curLine);
         %curLine++;
      }
   }

	//now set the actual break points...
	for (%i = 0; %i < DebuggerBreakPoints.rowCount(); %i++)
	{
		%breakText = DebuggerBreakPoints.getRowText(%i);
		%breakLine = getField(%breakText, 0);
		%breakFile = getField(%breakText, 1);
		if (%breakFile == $DebuggerFile)
         DebuggerFileView.setBreak(%breakLine);
	}
}

function TCPDebugger::handleBreak(%this, %line)
{
   DebuggerStatus.setValue("BREAK");
   
   // query all the watches
   for(%i = 0; %i < DebuggerWatchView.rowCount(); %i++)
   {
      %id = DebuggerWatchView.getRowId(%i);
      %row = DebuggerWatchView.getRowTextById(%id);
      %expr = getField(%row, 0);
      %this.send("EVAL " @ %id @ " 0 " @ %expr @ "\r\n");
   }

   // update the call stack window
   DebuggerCallStack.clear();

   %file = getWord(%line, 0);
   %lineNumber = getWord(%line, 1);
   %funcName = getWord(%line, 2);
   
   DbgOpenFile(%file, %lineNumber, true);

   %nextWord = 3;
   %rowId = 0;
   %id = 0;
   while(1)
   {
      DebuggerCallStack.setRowById(%id, %file @ "\t" @ %lineNumber @ "\t" @ %funcName);
      %id++;
      %file = getWord(%line, %nextWord);
      %lineNumber = getWord(%line, %nextWord + 1);
      %funcName = getWord(%line, %nextWord + 2);
      %nextWord += 3;
      if(%file $= "")
         break;
   }
}

function TCPDebugger::handleRunning(%this)
{
   DebuggerFileView.setCurrentLine(-1, true);
   DebuggerCallStack.clear();
   DebuggerStatus.setValue("RUNNING...");
}

function TCPDebugger::handleEvalOut(%this, %line)
{
   %id = firstWord(%line);
   %value = restWords(%line);

	//see if it's the cursor watch, or from the watch window
	if (%id < 0)
		DebuggerCursorWatch.setText(DebuggerCursorWatch.expr SPC "=" SPC %value);
	else
	{
	   %row = DebuggerWatchView.getRowTextById(%id);
	   if(%row $= "")
	      return;
	   %expr = getField(%row, 0);
	   DebuggerWatchView.setRowById(%id, %expr @ "\t" @ %value);
	}
}

function TCPDebugger::handleObjTagList(%this, %line)
{
}

function TCPDebugger::handleError(%this, %line)
{
   DebuggerConsoleView.print("ERROR - bogus message: " @ %line);
}

//--------------------------------------------------------------
// handlers for connection related functions
//--------------------------------------------------------------

function TCPDebugger::onDNSResolve(%this)
{

}

function TCPDebugger::onConnecting(%this)
{
}

function TCPDebugger::onConnected(%this)
{
   // send the password on connect.
   // %this.send(%this.password @ "\r\n");
	// tinman - this function never get's called - instead
	// send the password immediately...
}

function TCPDebugger::onConnectFailed(%this)
{

}

function TCPDebugger::onDisconnect(%this)
{

}

function DebuggerFilePopup::onSelect(%this, %id, %text)
{
   DbgOpenFile(%text, 0, false);
}

//--------------------------------------------------------------
// Gui glue functions
//--------------------------------------------------------------

$DbgWatchSeq = 1;
function DbgWatchDialogAdd()
{
	%expr = WatchDialogExpression.getValue();
	if (%expr !$= "")
   {
	   DebuggerWatchView.setRowById($DbgWatchSeq, %expr @"\t(unknown)");
      TCPDebugger.send("EVAL " @ $DbgWatchSeq @ " 0 " @ %expr @ "\r\n");
      $DbgWatchSeq++;
   }
	//don't forget to close the dialog
	Canvas.popDialog(DebuggerWatchDlg);
}

function DbgWatchDialogEdit()
{
	%newValue = EditWatchDialogValue.getValue();
	%id = DebuggerWatchView.getSelectedId();
	if (%id >= 0)
	{
	   %row = DebuggerWatchView.getRowTextById(%id);
      %expr = getField(%row, 0);
		if (%newValue $= "")
			%assignment = %expr @ " = \"\"";
		else
			%assignment = %expr @ " = " @ %newValue;
      TCPDebugger.send("EVAL " @ %id  @ " 0 " @ %assignment @ "\r\n");
	}

	//don't forget to close the dialog
	Canvas.popDialog(DebuggerEditWatchDlg);
}

function DbgSetCursorWatch(%expr)
{
	DebuggerCursorWatch.expr = %expr;
	if (DebuggerCursorWatch.expr $= "")
		DebuggerCursorWatch.setText("");
	else
      TCPDebugger.send("EVAL -1 0 " @ DebuggerCursorWatch.expr @ "\r\n");
}

function DebuggerCallStack::onAction(%this)
{
   %id = %this.getSelectedId();
   if(%id == -1)
      return;
   %text = %this.getRowTextById(%id);
   %file = getField(%text, 0);
   %line = getField(%text, 1);
   
   DbgOpenFile(%file, %line, %id == 0);
}

function DbgConnect()
{
	%address = DebuggerConnectAddress.getValue();
	%port = DebuggerConnectPort.getValue();
	%password = DebuggerConnectPassword.getValue();

	if ((%address !$= "" ) && (%port !$= "" ) && (%password !$= "" ))
	{
      TCPDebugger.connect(%address @ ":" @ %port);
	   TCPDebugger.schedule(5000, send, %password @ "\r\n");
      TCPDebugger.password = %password;
	}

	//don't forget to close the dialog
	Canvas.popDialog(DebuggerConnectDlg);
}

function DbgBreakConditionSet()
{
	%condition = BreakCondition.getValue();
	%passct = BreakPassCount.getValue();
	%clear = BreakClear.getValue();
   if (%condition $= "")
      %condition = "true";
   if (%passct $= "")
      %passct = "0";
   if (%clear $= "")
      %clear = "false";
   
   //set the condition
   %id = DebuggerBreakPoints.getSelectedId();
   if(%id != -1)
   {
      %bkp = DebuggerBreakPoints.getRowTextById(%id);
   
      DbgSetBreakPoint(getField(%bkp, 1), getField(%bkp, 0), %clear, %passct, %condition);
   }
	//don't forget to close the dialog
	Canvas.popDialog(DebuggerBreakConditionDlg);
}

function DbgOpenFile(%file, %line, %selectLine)
{
   if (%file !$= "")
   {
      //open the file in the file view
      if (DebuggerFileView.open(%file))
      {
         DebuggerFileView.setCurrentLine(%line, %selectLine);
			if (%file !$= $DebuggerFile)
			{
	         TCPDebugger.send("BREAKLIST " @ %file @ "\r\n");
	         $DebuggerFile = %file;
			}
      }
   }
}

function DbgFileViewFind()
{
	%searchString = DebuggerFindStringText.getValue();
	%result = DebuggerFileView.findString(%searchString);

	//don't forget to close the dialog
	Canvas.popDialog(DebuggerFindDlg);
}

function DbgFileBreakPoints(%file, %points)
{
   DebuggerFileView.breakPoints(%file, %points);
}   

// BRKSET:file line clear passct expr - set a breakpoint on the file,line
function DbgSetBreakPoint(%file, %line, %clear, %passct, %expr)
{
   if(!%clear)
   {
      if(%file == $DebuggerFile)
         DebuggerFileView.setBreak(%line);
   }
   DebuggerBreakPoints.addBreak(%file, %line, %clear, %passct, %expr);
   TCPDebugger.send("BRKSET " @ %file @ " " @ %line @ " " @ %clear @ " " @ %passct @ " " @ %expr @ "\r\n");
}

function DbgRemoveBreakPoint(%file, %line)
{
   if(%file == $DebuggerFile)
      DebuggerFileView.removeBreak(%line);
   TCPDebugger.send("BRKCLR " @ %file @ " " @ %line @ "\r\n");
   DebuggerBreakPoints.removeBreak(%file, %line);
}

$DbgBreakId = 0;

function DebuggerBreakPoints::addBreak(%this, %file, %line, %clear, %passct, %expr)
{
   // columns 0 = line, 1 = file, 2 = expr
   %textLine = %line @ "\t" @ %file @ "\t" @ %expr @ "\t" @ %passct @ "\t" @ %clear;
   %selId = %this.getSelectedId();
   %selText = %this.getRowTextById(%selId);
   if(getField(%selText, 0) $= %line && getField(%selText, 1) $= %file)
   {
      %this.setRowById(%selId, %textLine);
   }
   else
   {
      %this.addRow($DbgBreakId, %textLine);
      $DbgBreakId++;
   }
}

function DebuggerBreakPoints::removeBreak(%this, %file, %line)
{
   for(%i = 0; %i < %this.rowCount(); %i++)
   {
      %id = %this.getRowId(%i);
      %text = %this.getRowTextById(%id);
      if(getField(%text, 0) $= %line && getField(%text, 1) $= %file)
      {
         %this.removeRowById(%id);
         return;
      }
   }
}

function DbgDeleteSelectedBreak()
{
	%selectedBreak = DebuggerBreakPoints.getSelectedId();
	%rowNum = DebuggerBreakPoints.getRowNumById(%selectedWatch);
	if (%rowNum >= 0)
	{
		%breakText = DebuggerBreakPoints.getRowText(%rowNum);
		%breakLine = getField(%breakText, 0);
		%breakFile = getField(%breakText, 1);
      DbgRemoveBreakPoint(%breakFile, %breakLine);
	}
}

function DebuggerBreakPoints::clearBreaks(%this)
{
   while(%this.rowCount())
   {
      %id = %this.getRowId(0);
      %text = %this.getRowTextById(%id);
      %file = getField(%text, 1);
      %line = getField(%text, 0);
      DbgRemoveBreakPoint(%file, %line);
   }
}

function DebuggerBreakPoints::onAction(%this)
{
   %id = %this.getSelectedId();
   if(%id == -1)
      return;
   %text = %this.getRowTextById(%id);
   %line = getField(%text, 0);
   %file = getField(%text, 1);
   
   DbgOpenFile(%file, %line, 0);
}

function DebuggerFileView::onRemoveBreakPoint(%this, %line)
{
   %file = $DebuggerFile;
   DbgRemoveBreakPoint(%file, %line);
}

function DebuggerFileView::onSetBreakPoint(%this, %line)
{
   %file = $DebuggerFile;
   DbgSetBreakPoint(%file, %line, 0, 0, true);
}

function DbgConsoleEntryReturn()
{
   %msg = DbgConsoleEntry.getValue();
   if (%msg !$= "")
   {
      DebuggerConsoleView.print("%" @ %msg);
		if (DebuggerStatus.getValue() $= "NOT CONNECTED")
	      DebuggerConsoleView.print("*** Not connected.");
		else if (DebuggerStatus.getValue() $= "BREAK")
	      DebuggerConsoleView.print("*** Target is in BREAK mode.");
		else
	   	TCPDebugger.send("CEVAL " @ %msg @ "\r\n");

   }
   DbgConsoleEntry.setValue("");
}

function DbgConsolePrint(%status)
{
   DebuggerConsoleView.print(%status);
}

function DbgStackAddFrame(%file, %line, %funcName)
{
   if ((%file !$= "") && (%line !$= "") && (%funcName !$= ""))
      DebuggerCallStack.add(%file, %line, %funcName);
}

function DbgStackGetFrame()
{
   return DebuggerCallStack.getFrame();
}

function DbgStackClear()
{
   DebuggerCallStack.clear();
}

function DbgSetWatch(%expr)
{
	if (%expr !$= "")
		DebuggerWatchView.set(%expr);
}

function DbgDeleteSelectedWatch()
{
	%selectedWatch = DebuggerWatchView.getSelectedId();
	%rowNum = DebuggerWatchView.getRowNumById(%selectedWatch);
	DebuggerWatchView.removeRow(%rowNum);
}

function DbgRefreshWatches()
{
   // query all the watches
   for(%i = 0; %i < DebuggerWatchView.rowCount(); %i++)
   {
      %id = DebuggerWatchView.getRowId(%i);
      %row = DebuggerWatchView.getRowTextById(%id);
      %expr = getField(%row, 0);
      TCPDebugger.send("EVAL " @ %id @ " 0 " @ %expr @ "\r\n");
   }
}

function DbgClearWatches()
{
   DebuggerWatchView.clear();
}

function dbgStepIn()
{
   TCPDebugger.send("STEPIN\r\n");
}

function dbgStepOut()
{
   TCPDebugger.send("STEPOUT\r\n");
}

function dbgStepOver()
{
   TCPDebugger.send("STEPOVER\r\n");
}

function dbgContinue()
{
   TCPDebugger.send("CONTINUE\r\n");
}

DebuggerConsoleView.setActive(false);

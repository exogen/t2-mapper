//------------------------------------------
// Email code
//------------------------------------------
// email format is:
// id
// From
// read flag
// send date
// To
// CC
// Subject
// message body
//echo("Added email: " @ %tag SPC %text);

$EmailCachePath = "webcache/" @ getField(getRecord(wonGetAuthInfo(),0),3) @ "/";
$EmailFileName = "email1";
$EmailColumnCount = 0;
$EmailColumnName[0] = "Status";
$EmailColumnRange[0] = "50 75";
$EmailColumnCount++;
$EmailColumnName[1] = "From";
$EmailColumnRange[1] = "50 300";
$EmailColumnCount++;
$EmailColumnName[2] = "Subject";
$EmailColumnRange[2] = "50 300";
$EmailColumnCount++;
$EmailColumnName[3] = "Received";
$EmailColumnRange[3] = "50 300";
$EmailColumnCount++;
//-----------------------------------------------------------------------------
if(!isObject(EmailMessageVector))
{
   new MessageVector(EmailMessageVector);
   $EmailNextSeq = 0;
}
//-----------------------------------------------------------------------------
function LaunchEmail()
{
   LaunchTabView.viewTab( "EMAIL", EmailGui, 0 );
	EmailGui.checkSchedule = schedule(1000,0, CheckEmail, false);
}
//-----------------------------------------------------------------------------
function EmailMessageNew()
{
	Email_ToEdit.setText("");
	Email_CCEdit.setText("");
   $EmailSubject = "";
   EmailBodyText.setValue("");

   EMailComposeDlg.state = "sendMail";
   Canvas.pushDialog(EmailComposeDlg);
   Email_ToEdit.makeFirstResponder(1);
}
//-----------------------------------------------------------------------------
function EmailMessageReply()
{
   EMailComposeDlg.state = "replyMail";
   %text = EmailMessageVector.getLineTextByTag( EM_Browser.getSelectedId() );
	Email_ToEdit.setText(getField(getRecord(%text, 1), 0));
	Email_CCEdit.setText("");
   $EmailSubject = "RE: " @ getRecord(%text, 6);
   %date = getRecord(%text, 3);
   Canvas.pushDialog(EmailComposeDlg);
   EmailBodyText.setValue("\n\n----------------------------------\n On " @ %date SPC Email_toEdit.getValue() @ " wrote:\n\n" @ EmailGetBody(%text) );
   EmailBodyText.SetCursorPosition(0);
   EmailBodyText.makeFirstResponder(1);
}
//-----------------------------------------------------------------------------
function EmailMessageForward()
{
   %text = EmailMessageVector.getLineTextByTag( EM_Browser.getSelectedId() );
	Email_ToEdit.setText("");
	Email_CCEdit.setText("");
   $EmailSubject = "FW: " @ getRecord(%text, 6);
   Canvas.pushDialog(EmailComposeDlg);
   EmailBodyText.setValue("\n\n\n--- Begin Forwarded Message ---\n\n" @ EmailGetTextDisplay(%text));
   Email_toEdit.makeFirstResponder(1);
   EmailBodyText.SetCursorPosition(0);
   EMailComposeDlg.state = "forwardMail";
}
//-----------------------------------------------------------------------------
function EmailMessageReplyAll()
{
   EMailComposeDlg.state = "replyAll";
   %text = EmailMessageVector.getLineTextByTag( EM_Browser.getSelectedId() );
   Email_ToEdit.setText(getField(getRecord(%text, 1), 0));
   Email_CCEdit.setText(getRecord(%text, 4) @ getRecord(%text,5));
   $EmailSubject = "RE: " @ getRecord(%text, 6);
   %date = getRecord(%text, 3);
   Canvas.pushDialog(EmailComposeDlg);
   EmailBodyText.setValue("\n\n===========================\n On " @ %date SPC Email_ToEdit.getValue() @ " wrote:\n\n" @ EmailGetBody(%text) );
   EmailBodyText.makeFirstResponder(1);
   EmailBodyText.SetCursorPosition(0);
}
//-----------------------------------------------------------------------------
function EmailMessageDelete()
{
	%id = EM_Browser.getSelectedId();
	if ( %id == -1 )
		return;

	%row = EM_Browser.findById( %id );
	EMailComposeDlg.key = LaunchGui.key++;

   // Make these buttons inactive until another message is selected:
    if(rbInbox.getValue())
	{
		%nx = 6;
		EMailComposeDlg.state = "deleteMail";
		DoEmailDelete(%nx,%id,EMailComposeDlg, EMailComposeDlg.key, %row);
	}
	else
	{		
		%nx = 35;
		EMailComposeDlg.state = "removeMail";
		MessageBoxYesNo("CONFIRM","Permanently Remove Selected EMail?","DoEmailDelete(" @ %nx @ "," @ %id @ "," @ EmailComposeDlg @ "," @ EmailComposeDlg.key @ "," @ %row @ ");");
	}

}
//-----------------------------------------------------------------------------
function DoEmailDelete(%qnx, %mid, %owner, %key, %row)
{		
	EM_ReplyBtn.setActive( false );
	EM_ReplyToAllBtn.setActive( false );
	EM_ForwardBtn.setActive( false );
	EM_DeleteBtn.setActive( false );
	EM_BlockBtn.setActive( false );

	EM_Browser.removeRowByIndex( %row );
	EmailMessageVector.deleteLine(EmailMessageVector.getLineIndexByTag(%mid));

	if(%qnx==6)
		EmailGui.dumpCache();


    if ( EM_Browser.rowCount() == 0 )
      EMailInboxBodyText.setText("");
	else
		EM_Browser.setSelectedRow(%row);

	DatabaseQuery(%qnx, %mid, %owner, %key);

}
//-----------------------------------------------------------------------------
function EmailSend()
{
	EMailComposeDlg.key = LaunchGui.key++;
	EMailComposeDlg.state = "sendMail";
	CheckEmailNames();
	%to = Email_ToEdit.getValue();
	%cc = Email_CCEdit.getValue();
	%subj = $EmailSubject;
	%text = EMailBodyText.getValue();
	%lenny = strLen(%to @ %cc @ %subj);
	DatabaseQuery(5, %to TAB %cc TAB %subj TAB getSubStr(%text,0,4000-%lenny),EMailComposeDlg,EMailComposeDlg.key);
	Canvas.popDialog(EmailComposeDlg);
}
//-----------------------------------------------------------------------------
function EmailMessageAddRow(%text, %tag)
{
   EM_Browser.addRow( %tag, getField( getRecord( %text, 1 ) ,0 ),
                      		getRecord( %text, 6 ), 
                      		getRecord( %text, 3 ), 
                      		getRecord( %text, 2 ));
}
//-----------------------------------------------------------------------------
function EmailGetBody(%text)
{
   %msgText = "";
   %rc = getRecordCount(%text);

   for(%i = 7; %i < %rc; %i++)
      %msgText = %msgText @ getRecord(%text, %i) @ "\n";
   return %msgText;
}
//-----------------------------------------------------------------------------
function getNameList(%line)
{
   if(%line $= "")
      return "";

   %ret = getField(getTextName(%line, 0), 0);
   %count = getFieldCount(%line) / 4;
   for(%i = 1; %i < %count; %i++)
      %ret = %ret @ ", " @ getField(getTextName(%line, %i * 4), 0);
}
//-----------------------------------------------------------------------------
function getLinkNameOnly(%line)
{
	if(%line $= "" || %line $= " ")
		return "";
	%name = getField(%line,0);
	%str = "<color:FFFFFF>" @ %name;
	%ret = "<a:player" TAB %name @ "><spush>" @ %str @ "<spop></a>";
	return %ret;
}
//-----------------------------------------------------------------------------
function getLinkNameList(%line)
{
   if(%line $= "")
      return "";

   %ret = getLinkName(%line, 0);
   %count = getFieldCount(%line) / 4;
   for(%i = 1; %i < %count; %i++)
      %ret = %ret @ ", " @ getLinkName(%line, %i * 4);
}
//-----------------------------------------------------------------------------
function CheckEmailNames()
{
	%EmailTOAddress = strUpr(trim(Email_ToEdit.getValue()));
	%EmailCCAddress = strUpr(trim(Email_CCEdit.getValue()));
	%toLength = strLen(%EmailTOAddress);
	%ccLength = strLen(%EmailCCAddress);
	%checkList = "";
	if(%toLength > 0)
	{
		if(trim(getSubStr(%EmailTOAddress,%toLength-1,1)) !$= "," || trim(getSubStr(%EmailTOAddress,%toLength,1)) !$= ",")
			%EmailTOAddress = %EmailTOAddress @ ",";
	}
	else
		%EmailTOAddress = ",";

	if(%ccLength > 0)
	{
		if(trim(getSubStr(%EmailCCAddress,%ccLength-1,1)) !$= "," || trim(getSubStr(%EmailCCAddress,%ccLength,1)) !$= ",")
			%EmailCCAddress = %EmailCCAddress @ ",";
	}
	else
		%ccList = ",";

	for(%x=0;%x<2;%x++)
	{
		%pos = 0;
		%start = 0;

		if(%x == 0)
			%nList = %EmailTOAddress;
		else if(%x == 1)
		{
			%EmailTOAddress = %nList;
			%nList = %EmailCCAddress;
		}

		if(strLen(%nList)>1)
		{
			while((%pos = strPos(%nList,",",%start)) != -1 && %cx++ < 40)
			{
				%name = getSubStr(%nList,%start,%pos-%start);
				%nameLength = strLen(%name);
				%name = trim(%name);
				if((%checkStr = strStr(%checkList,%name)) != -1)
				{
					if(%checkStr == 0)
						%checkVal = ",";
					else
						%checkVal = getSubStr(%checkList,strStr(%checkList,%name)-1,1);

					if(%checkVal $= "," || %checkVal $= " ")
					{
						if(%pos-%nameLength == %start && %start == 0)
						{
							%nList =  trim(getSubStr(%nList,%pos+1,strLen(%nList)));
						}
						else
						{
							%nList =  trim(getSubStr(%nList,0,(%pos-%nameLength))) @
									  trim(getSubStr(%nList,%pos+1,strLen(%nList)));
							%start = %pos-%nameLength;
						}
					}
					else
					{
						if(strLen(%checkList)==0)
							%checkList = %name;
						else
							%checkList = %checkList @ "," @ %name;
						%start = %pos+1;
					}
				}
				else
				{
					if(strLen(%checkList)==0)
						%checkList = %name;
					else
						%checkList = %checkList @ "," @ %name;
					%start = %pos+1;
				}
			}
		}
	}
	%EmailCCAddress = %nList;
	Email_ToEdit.setText(%EMailToAddress);
	Email_CCEdit.setText(%EmailCCAddress);
}
//-----------------------------------------------------------------------------
function EmailGetTextDisplay(%text)
{
   	%pos = 0;
   	%strStart = 0;
	%curList = strupr(getRecord(%text,4));
	%to = "";
	if(strLen(%curList) > 1)
	{
		if(trim(getSubStr(%curList,strLen(%curList)-1,1)) !$= ",")
			%curList = %curList @ ",";
	}
	else
		%curList = ",";

  	while((%pos = strpos(%curList, ",", %strStart)) != -1)
  	{  		
		if(%strStart==0)
				%to = trim(getLinkNameOnly(getSubStr(%curList, %strStart, %pos-%strStart)));
		else
	 			%to = %to @ "," @ trim(getLinkNameOnly(getSubStr(%curList, %strStart, %pos-%strStart)));

  		%strStart = %pos+1;
  	}
   	%pos = 0;
   	%strStart = 0;
	%curList = strupr(getRecord(%text,5));
	%ccLine = "";
	if(strLen(%curList) > 1)
	{
		if(trim(getSubStr(%curList,strLen(%curList)-1,1)) !$= ",")
			%curList = %curList @ ",";
	}
	else
		%curList = ",";

  	while((%pos = strpos(%curList, ",", %strStart)) != -1)
  	{  				
		if(%strStart==0)
				%ccLine = getLinkNameOnly(getSubStr(%curList, %strStart, %pos-%strStart));
		else
 				%ccLine = %ccLine @ "," @ getLinkNameOnly(getSubStr(%curList, %strStart, %pos-%strStart));

  		%strStart = %pos+1;
  	}
    %from = getLinkName(getRecord(%text, 1), 0);

   %msgtext = "From: " @ %from NL
           "To: " @ %to NL
           "CC: " @ %ccLine NL
           "Subject: " @ getRecord(%text, 6) NL
           "Date Sent: " @ getRecord(%text, 3) @ "\n\n" @
           EmailGetBody(%text);
}
//-----------------------------------------------------------------------------
function EmailNewMessageArrived(%message, %seq)
{
   $EmailNextSeq = %seq;
   EmailMessageVector.pushBackLine(%message, %seq);
   EmailMessageAddRow(%message, %seq);
}
//-----------------------------------------------------------------------------
function GetEMailBtnClick()
{
	if(isEventPending(EMailGUI.checkSchedule))
		cancel(EmailGui.checkSchedule);

	EMailGui.btnClicked = true;
	EMailGui.checkingEMail = false;
	EMailGui.checkSchedule = schedule(1000 * 2, 0, CheckEmail, false);
  	canvas.SetCursor(ArrowWaitCursor);
}
//-----------------------------------------------------------------------------
function CheckEmail(%calledFromSched)
{	
	if(EmailGui.checkingEmail)
	{
//		echo("Check In Progress");
		return;
	}

	if(EmailGui.checkSchedule && !%calledFromSched)
	{
//		echo("Email Schedule " @ EmailGui.checkSchedule @ "Cancelled");
		cancel(EmailGui.checkSchedule); // cancel schedule
	}
	EmailGui.checkSchedule = "";
	EMailGui.key = LaunchGui.key++;
	EmailGui.state = "getMail";
	EM_Browser.clear();
	EmailGui.LoadCache();
	DatabaseQueryArray(1,0,$EmailNextSeq, EMailGui, EMailGui.key);
	EmailGui.checkingEmail = true;
}
//-----------------------------------------------------------------------------
function CancelEmailCheck()
{
   if ( EmailGui.checkSchedule )
   {
      error( ">> SCHEDULED EMAIL CHECK " @ EmailGui.checkSchedule @ " CANCELED <<" );
      cancel( EmailGui.checkSchedule );
      EmailGui.checkSchedule = "";
   }
}
//-----------------------------------------------------------------------------
function EmailEditBlocks()
{
   Canvas.pushDialog(EmailBlockDlg);
   EmailBlockList.clear();
   EMailBlockDlg.key = LaunchGui.key++;
   EmailBlockDlg.state = "getBlocklist";
   DatabaseQueryArray(2,0,"",EMailBLockDlg,EMailBLockDlg.key);
}
//-----------------------------------------------------------------------------
function EmailBlockSender()
{
	%id = EM_Browser.getSelectedId();
	if ( %id == -1 )
    {		
		MessageBoxOK("WARNING","You cannot block a non-existent sender.");
		return;
	}
	else
	{
		%text = EmailMessageVector.getLineTextByTag( EM_Browser.getSelectedId() );
		%blockAddress = getField(getRecord(%text, 1), 0);
		if(trim(%blockAddress) !$= "")
		{
		    EMailBlockDlg.state = "setBlock";
	   		EMailBlockDlg.key = LaunchGui.key++;
			DatabaseQuery(9,%blockAddress,EmailBlockDlg,EMailBlockDlg.key);
		}
	}
}
//-----------------------------------------------------------------------------
function EmailBlockRemove()
{
   %rowId = EmailBlockList.getSelectedId();
   if(%rowId == -1)
   {
		MessageBoxOK("WARNING","You cannot remove a non-existent block.");
      	return;
   }
   else
   {
	    %line = EmailBlockList.getRowTextById(%rowId);
	    %name = getField(%line, 2);
		EMailBlockDlg.state = "removeBlock";
		EMailBlockDlg.key = LaunchGui.key++;
		DatabaseQuery(8,%name,EMailBLockDlg,EMailBLockDlg.key);
		EmailBlockList.removeRowById(%rowId);
   }
}
//-- EMailComposeDlg ----------------------------------------------------------------
function EmailComposeDlg::onWake( %this )
{
   // Get the compose dialog position and size from the prefs:
   %res = getResolution();
   %resW = firstWord( %res );
   %resH = getWord( %res, 1 );
   %w = firstWord( $pref::Email::ComposeWindowExtent );
   if ( %w > %resW )
      %w = %resW;
   %h = getWord( $pref::Email::ComposeWindowExtent, 1 );
   if ( %h > %resH )
      %h = %resH;
   %x = firstWord( $pref::Email::ComposeWindowPos );
   if ( %x > %resW - %w )
      %x = %resW - %w;
   %y = getWord( $pref::Email::ComposeWindowPos, 1 );
   if ( %y > %resH - %h )
      %y = %resH - %h;

   EmailComposeWindow.resize( %x, %y, %w, %h );
}
//-----------------------------------------------------------------------------
function EmailComposeDlg::onSleep( %this )
{
   $pref::Email::ComposeWindowPos = EmailComposeWindow.getPosition();
   $pref::Email::ComposeWindowExtent = EmailComposeWindow.getExtent();
}
//-----------------------------------------------------------------------------
function EMailComposeDlg::onDatabaseQueryResult(%this, %status, %RowCount_Result, %key)
{
	if(%this.key != %key)
		return;
//	echo("RECV: " @ %status TAB %RowCount_Result);
	if(getField(%status,0)==0)
	{
		switch$(%this.state)
		{
			case "deleteMail":
				%this.state = "done";
			case "removeMail":
				%this.state = "done";
			case "sendMail":
				%this.state = "done";
		}
	}
	else if (getSubStr(getField(%status,1),0,9) $= "ORA-04061")
	{
		%this.state = "error";
		MessageBoxOK("ERROR","There was an error processing your request, please wait a few moments and try again.");
	}
	else
		MessageBoxOK("ERROR",getField(%status,1));
}
//-----------------------------------------------------------------------------
function EmailComposeDlg::Cancel(%this)
{
	Canvas.PopDialog(EmailComposeDlg);
}
//-----------------------------------------------------------------------------
function EmailComposeDlg::SendMail(%this)
{
	%EmailToAddress = Email_ToEdit.getValue();
	%EmailSubject = EMail_Subject.getValue();
	// NEED TO CHECK FOR DUPLICATES
	if(trim(%EmailToAddress) $= "")
		MessageBoxOK("No Address","TO Address may not be left blank.  Please enter a player name to send this message to.");
	else
	{
   		if(trim(%EmailSubject) $= "")
			MessageBoxOK("No Subject","Please enter a Subject for your message.");
		else
			EMailSend();
	}
}
//-- EMailBlockDlg -----------------------------------------------------------
function EMailBlockDlg::onDatabaseQueryResult(%this,%status,%ResultString,%key)
{
	if(%this.key != %key)
		return;
//	echo("RECV: " @ %status TAB %ResultString);
	if(getField(%status,0)==0)
	{
		switch$(%this.state)
		{
			case "getBlocklist":
				%this.state = "names";
				%this.blockCount = getField(%ResultString,0);
			case "removeBlock":
				MessageBoxOK("NOTICE",getField(%status,1));
			case "setBlock":
				MessageBoxOK("NOTICE",getField(%status,1));
		}
	}
	else if (getSubStr(getField(%status,1),0,9) $= "ORA-04061")
	{
		%this.state = "error";
		MessageBoxOK("ERROR","There was an error processing your request, please wait a few moments and try again.");
	}
	else
	{
		%this.state = "error";
		MessageBoxOK("ERROR",getField(%status,1));
	}
}
//-----------------------------------------------------------------------------
function EMailBlockDlg::onDatabaseRow(%this,%row,%isLastRow,%key)
{
	if(%this.key != %key)
		return;
//	echo("RECV: " @ %row TAB %isLastRow);
	switch$(%this.state)
	{
		case "names":
			%textName = getTextName(getFields(%row,0,4));
			%id = getField(%row,3);
			%blockedCount = getField(%row,4);
      		EmailBlockList.addRow(%id, getField(%textName,0) TAB %blockedCount TAB %row);
	}
}
//-----------------------------------------------------------------------------
function CheckAllDuplicates(%player)
{
  %lCount = LC_ToList.rowCount();
  %cCount = LC_CCList.rowCount();
  %vResult = 0;
  if(%lCount>0)
  {
	for(%l=0;%l<%lCount;%l++)
	{
	  %lstr =  LC_ToList.getRowText(%l);
	  if(%lstr $= %player)
	    %vResult++;
	}
  }

  if(%cCount>0)
  {
	for(%c=0;%c<%cCount;%c++)
	{
	  %cstr =  LC_CCList.getRowText(%c);
	  if(%cstr $= %player)
	    %vResult++;
	}
  }
  return %vResult;
}
//-----------------------------------------------------------------------------
function LaunchAddressDlg()
{
  Canvas.PushDialog("AddressDlg");
}
//-----------------------------------------------------------------------------
function ListToStr(%listName,%delim)
{
  %str = "";
  %rCount = %listName.rowCount();
  if (%rCount > 0)
  {
	  for(%r=0;%r<%rCount;%r++)
	  {
	    %str = %str @ %listName.getRowText(%r);
	    if(%r < %rCount-1)
		{
		  %str = %str @ %delim;
		}
	  }
	  return %str;
  }
}
//-----------------------------------------------------------------------------
function StrToList(%listName, %str, %delim)
{
  %listName.Clear();
  %sCount = 0;
  %sSize = strlen(%str);
  if (%sSize > 0)
  {
	  for(%l=0;%l<=%sSize;%l++)
	  {
	    %txt = getSubStr(%str,%l,1);
		if( %txt $= %delim || %l == %sSize )
		{
		  %listName.addRow(%sCount,trim(%sText));
		  %sText = "";
		  %sCount++;
		}
		else
		{
		  %sText = %sText @ %txt;
		}
	  }
  }
}
//-----------------------------------------------------------------------------
function LC_BigList::GetOnlineStatus(%this)
{
    %this.key = LaunchGui.key++;
    %this.status = "getOnline";
    for(%oStat=0;%oStat<%this.RowCount();%oStat++)
    {
      if(%oStat == 0)
        %roster = %this.getRowID(%oStat);
      else
        %roster = %roster TAB %this.getRowID(%oStat);
    }
    databaseQuery(69,%roster, %this,%this.key);
}
//-----------------------------------------------------------------------------
function AddressDlg::onDatabaseQueryResult(%this,%status,%resultString,%key)
{
	if(%this.key != %key)
		return;
//	echo("RECV: " @ %status TAB %resultString);
	if(getField(%status,0)==0)
	{
		switch$(%this.state)
		{
			case "goSearch":
				if(getField(%resultString,0)<=0)
				{
					%this.state = "done";
					MessageBoxOK("NOTICE","No Match Found.");
				}
				else
				{
					%this.state = "memberList";
					%this.linecount = -1;
					LC_BigList.clear();
				}
			case "getBuddyList":
				if(getField(%resultString,0)<=0)
				{
					%this.state = "done";
					MessageBoxOK("NOTICE","You have no Buddies.");
				}
				else
				{
					%this.state = "buddyList";
					%this.linecount = -1;
					LC_BigList.clear();
				}				
			case "getTribeMembers":
				if(getField(%resultString,0)<=0)
				{
					%this.state = "done";
					MessageBoxOK("NOTICE","Cloak Packs are engaged, Tribe Mates could not be detected.");
				}
				else
				{
					%this.state = "tribeMembers";
					%this.linecount = -1;
					LC_BigList.clear();
				}				
			case "addBuddy":
				MessageBoxOK("CONFIRMED",getField(%status,1));				
			case "dropBuddy":
				MessageBoxOK("CONFIRMED",getField(%status,1));				
		}
	}
	else if (getSubStr(getField(%status,1),0,9) $= "ORA-04061")
	{
		%this.state = "error";
		MessageBoxOK("ERROR","There was an error processing your request, please wait a few moments and try again.");
	}
	else
	{
		switch$(%this.state)
		{
			case "goSearch":
				%this.state = "error";
				MessageBoxOk("ERROR",getField(%status,1));
		}
	}
}
//-----------------------------------------------------------------------------
function AddressDlg::onDatabaseRow(%this,%row,%isLastRow,%key)
{
	if(%this.key != %key)
		return;

//	echo("RECV : " @ %row);
	switch$(%this.state)
	{
		case "memberList":
			LC_BigList.addRow(%this.linecount++,getField(%row,1));
		case "buddyList":
			LC_BigList.addRow(%this.linecount++,getField(%row,0));
		case "tribeMembers":
			LC_BigList.addRow(%this.linecount++,getField(%row,0));
	}
}
//-----------------------------------------------------------------------------
function AddressDlg::AddBuddylist(%this)
{
  %this.key = LaunchGui.key++;
  %this.lbstate = "buddylist";
  switch (%this.SrcList)
  {
    case 0:
	  %addremove = LC_BuddyListBtn.direction;
	  %player = LC_BigList.getValue();
      %selRow = LC_BigList.getRownumByID(LC_BigList.GetSelectedID());
	case 1:
	  %addremove = 0;
	  %player = LC_ToList.getValue();
	case 2:
	  %addremove = 0;
      %player = LC_CCList.getValue();
  }

  if (%addremove==0)
  {
    %this.doRefresh = 1;
	%this.state = "addBuddy";
 	DatabaseQuery(10,%player,%this,%this.key);
  }
  else
  {    
    %this.state = "dropBuddy";
	DatabaseQuery(11,%player,%this,%this.key);
	LC_BigList.removeRowbyId(LC_BigList.getSelectedID());
	if(%selRow>=LC_BigList.RowCount())
	  %selRow = LC_BigList.RowCount()-1;
	LC_BigList.setSelectedRow(%selRow);
  }
}
//-----------------------------------------------------------------------------
function AddressDlg::AddCC(%this)
{
  if(LC_CCListBtn.direction == 0)
  {
    %addName = LC_BigList.getRowText(LC_BigList.getSelectedID());
    %hasDupes = CheckAllDuplicates(%addName);
    if(%hasDupes == 0)
      LC_CCList.addRow(LC_CCList.RowCount()+1, %addName);
  }
  else
  {
    %selRow = LC_CCList.getRownumByID(LC_CCList.GetSelectedID());
    LC_CCList.removeRowbyID(LC_CCList.getSelectedID());
	if(%selRow>=LC_CCList.RowCount())
	  %selRow = LC_CCList.RowCount()-1;
	LC_CCList.setSelectedRow(%selRow);
  }
  %this.DestList = 1;
}
//-----------------------------------------------------------------------------
function AddressDlg::AddTo(%this)
{
  if(LC_ToListBtn.direction == 0)
  {
    %addName = LC_BigList.getRowText(LC_BigList.getSelectedID());
    %hasDupes = CheckAllDuplicates(%addName);
    if(%hasDupes == 0 )
      LC_ToList.addRow(LC_ToList.RowCount()+1, %addName);
  }
  else
  {
    %selRow = LC_ToList.getRownumByID(LC_ToList.GetSelectedID());
    LC_ToList.removeRowbyID(LC_ToList.getSelectedID());
	if(%selRow>=LC_ToList.RowCount())
	  %selRow = LC_ToList.RowCount()-1;
	LC_ToList.SetSelectedRow(%selRow);
  }
  %this.DestList = 0;
}
//-----------------------------------------------------------------------------
function AddressDlg::Cancel(%this)
{
  LC_BigList.Clear();
  Canvas.PopDialog("AddressDlg");
}
//-----------------------------------------------------------------------------
function AddressDlg::GoSearch(%this)
{
	if(trim(LC_Search.getValue()) !$="")
	{
		%this.key = LaunchGui.key++;
		%this.state = "goSearch";
		%this.lbstate = "errorcheck";
		DatabaseQueryArray(3,100,trim(LC_Search.getValue()) TAB 0 TAB 100 TAB 1 ,%this, %this.key,true);
		LC_BuddyListBtn.direction = 0;
		LC_BuddyListBtn.text = "ADD TO BUDDYLIST";
		LC_ListBox.setSelected(0);
	}
	else
		MessageBoxOK("WARNING","Null searches (blank) are not allowed.  Please enter letter(s) to search for.");
}
//-----------------------------------------------------------------------------
function AddressDlg::GoList(%this)
{
  %this.key = LaunchGui.key++;
  %this.lbstate = "errorcheck";
  if(LC_ListBox.getValue() $="Select List")
  {
    LC_BigList.clear();
  }
  else if(LC_ListBox.getValue() $="Buddy List")
  {	
  	%this.state = "getBuddyList";
	DatabaseQueryArray(5,0,"",%this,%this.key);
	LC_BuddyListBtn.direction = 1;
	LC_BuddyListBtn.text = "REMOVE FROM BUDDYLIST";
  }
  else
  {
	%this.state = "getTribeMembers";
	DatabaseQueryArray(6,0,LC_ListBox.getValue(),%this,%this.key,true);
	LC_BuddyListBtn.direction = 0;
	LC_BuddyListBtn.text = "ADD TO BUDDYLIST";
  }
}
//-----------------------------------------------------------------------------
function AddressDlg::OK(%this)
{
  if (LC_ToList.rowCount() > 0)
    EMail_ToEdit.setValue(ListToStr(LC_ToList,","));

  if (LC_CCList.rowCount() > 0)
    EMail_CCEdit.setValue(ListToStr(LC_CCList,","));

  LC_BigList.Clear();
  Canvas.PopDialog("AddressDlg");
}
//-----------------------------------------------------------------------------
function AddressDlg::onClick(%this, %sender)
{
  switch$(%sender)
  {
    case "BIGLIST":
	  LC_ToListBtn.text = "ADD";
	  LC_CCListBtn.text = "ADD";
	  LC_ToListBtn.direction = 0;
	  LC_CCListBtn.direction = 0;
	  LC_ToList.setSelectedRow(-1);
	  LC_CCList.setSelectedRow(-1);
	  %this.SrcList = 0;
      LC_BuddyListBtn.setVisible(1);
	  if(LC_ListBox.getValue() $="Buddy List")
	  {
	    LC_BuddyListBtn.direction = 1;
	    LC_BuddyListBtn.SetValue("REMOVE FROM BUDDYLIST");
	  }
	  else
	  {
	    LC_BuddyListBtn.direction = 0;
	    LC_BuddyListBtn.SetValue("ADD TO BUDDYLIST");
	  }
	case "TOLIST":
	  LC_ToListBtn.text = "DEL";
	  LC_ToListBtn.direction = 1;
	  LC_BigList.setSelectedRow(-1);
	  LC_CCList.setSelectedRow(-1);
      %this.DestList = 0;
	  %this.SrcList = 1;
	  LC_BuddyListBtn.direction = 0;
	  LC_BuddyListBtn.SetValue("ADD TO BUDDYLIST");
      LC_BuddyListBtn.setVisible(1);
	case "CCLIST":
	  LC_CCListBtn.text = "DEL";
	  LC_CCListBtn.direction = 1;
	  LC_ToList.setSelectedRow(-1);
	  LC_BigList.setSelectedRow(-1);
      %this.DestList = 1;
	  %this.SrcList = 2;
	  LC_BuddyListBtn.direction = 0;
	  LC_BuddyListBtn.SetValue("ADD TO BUDDYLIST");
      LC_BuddyListBtn.setVisible(1);
	case "LISTBOX":
	  LC_ToList.setSelectedRow(-1);
	  LC_BigList.setSelectedRow(-1);
	  LC_CCList.setSelectedRow(-1);
	  %this.SrcList = 0;
      LC_BuddyListBtn.setVisible(0);
	  %this.GoList();
	case "SEARCHBOX":
	  LC_ToList.setSelectedRow(-1);
	  LC_BigList.setSelectedRow(-1);
	  LC_CCList.setSelectedRow(-1);
	  %this.SrcList = 0;
      LC_BuddyListBtn.setVisible(0);
  }
  Canvas.repaint();
}
//-----------------------------------------------------------------------------
function AddressDlg::onDblClick(%this,%caller)
{
  switch(%caller)
  {
    case 0:
	  if(%this.DestList==0)
	    %this.AddTo();
	  else
	    %this.AddCC();
	case 1:
	  LC_ToList.removeRowbyID(LC_ToList.getSelectedID());
	  LC_ToList.SetSelectedRow(0);
	case 2:
	  LC_CCList.removeRowbyID(LC_CCList.getSelectedID());
	  LC_CCList.SetSelectedRow(0);
  }
}
//-----------------------------------------------------------------------------
function AddressDlg::onWake(%this)
{
	%this.doRefresh = 0;
	%this.key = LaunchGui.key++;
	%this.state = "loadlistbox";
	%this.lbstate = "errorcheck";
	%this.DestList = 0;
	%this.SrcList = 0;
	LC_BuddyListBtn.setVisible(0);
	LC_ListBox.Clear();
	LC_ListBox.Add("Select List",0);
	LC_ListBox.Add("Buddy List",1);
	LC_ListBox.setSelected(0);
	LC_Search.clear();
	StrToList(LC_ToList,Email_ToEdit.getValue(),",");
	StrToList(LC_CCList,Email_CCEdit.getValue(),",");
   %info = WONGetAuthInfo();
   %tribeCount = getField( getRecord( %info, 1 ), 0 ); //%cert
   for ( %i = 0; %i < %tribeCount; %i++ )
   {
	   %tribe = getField( getRecord( %info, %i + 2 ), 0 ); //%cert
	   LC_ListBox.add(%tribe,%i);
   }
}
//-- EMailGui ----------------------------------------------------------------
function EmailGui::onWake(%this)
{
	// Make these buttons inactive until a message is selected:
	EM_ReplyBtn.setActive( false );
	EM_ReplyToAllBtn.setActive( false );
	EM_ForwardBtn.setActive( false );
	EM_DeleteBtn.setActive( false );
	EM_BlockBtn.setActive( false );
   	%selId = EM_Browser.getSelectedId();
	Canvas.pushDialog(LaunchToolbarDlg);


	if(!%this.cacheFile)
	{
		%this.cacheFile = $EmailFileName;
		EmailGui.getCache();
	}
	if ( !EmailGui.cacheLoaded || EM_Browser.rowCount() == 0 )
    {
  		EmailGui.checkingEmail = false;	
		if(!rbInbox.getValue())
		  	rbInbox.setValue(1);
		else
		{
	   		EmailGui.GetCache();
			EmailGui.OutputVector();
		}
   }

   if ( EM_Browser.rowCount() > 0 )
   {
      %row = EM_Browser.findById( %selId );
      if ( %row == -1 )
         EM_Browser.setSelectedRow( 0 );
      else
         EM_Browser.setSelectedRow( %row );
   }
}
//-----------------------------------------------------------------------------
function EmailGui::ButtonClick(%this,%ord)
{
	switch(%ord)
	{
		case 0:	em_GetMailBtn.setVisible(1);
				GetEmailBtnClick();
		case 1:	em_GetMailBtn.setVisible(0);
				EM_Browser.clear();
				EMailMessageVector.clear();
				EmailInboxBodyText.setText("");
				EMailGui.state = "getDeletedMail";
				EmailGui.key = LaunchGui.key++;
				DatabaseQueryArray(14,100,EmailGui.state,EMailGui,EMailGui.key,true);
	}
}
//-----------------------------------------------------------------------------
function EMailGui::onDatabaseQueryResult(%this, %status, %RowCount_Result, %key)
{
	if(%this.key != %key)
		return;
//	echo("RECV: " @ %status);
	if(getField(%status,0)==0)
	{
		switch$(%this.state)
		{
			case "getMail":
				%this.soundPlayed = false;
				if(getField(%RowCount_Result,0)>0)
				{
					%this.messageCount = 0;
					%this.message = "";
					%this.state = "NewMail";
					%this.getCache();
				}
				else
				{
					%this.state = "done";
					EMailGui.getCache();
					EMailGui.outputVector();
					if(EMailGui.btnClicked)
						EmailGui.btnClicked = false;

					%this.checkingEmail = false;
		   			%this.checkSchedule = schedule(1000 * 60 * 5, 0, CheckEmail, true);
				}
			case "sendMail":
				%this.state = "done";
				CheckEMail();
			case "deleteMail":
				%this.state = "done";
				CheckEMail();
			case "forwardMail":
				%this.state = "done";
				CheckEMail();
			case "replyMail":
				%this.state = "done";
				CheckEMail();
			case "replyAllMail":
				%this.state = "done";
				CheckEMail();
			case "blockSender":
				%this.state = "done";
			case "Refresh":
				%this.state = "done";
				CheckEMail();
			case "getDeletedMail":
				if(getField(%RowCount_Result,0)>0)
				{
					%this.messageCount = 0;
					%this.message = "";
					%this.state = "DeletedMail";
				}
				else
				{
					%this.state = "done";
					MessageBoxOK("NOTICE",getField(%status,2));
				}
		}
	}
	else if (getSubStr(getField(%status,1),0,9) $= "ORA-04061")
	{
		%this.state = "error";
		MessageBoxOK("ERROR","There was an error processing your request, please wait a few moments and try again.");
	}
	else
	{
		%this.state = "error";
		MessageBoxOK("ERROR","Error Retrieving Messages");
	}
  canvas.SetCursor(DefaultCursor);
}
//-----------------------------------------------------------------------------
function EMailGui::onDatabaseRow(%this, %row,%isLastRow,%key)
{
	if(%this.key != %key)
		return;

//	echo("RECV: " @ %row NL %isLastRow);
	switch$(%this.state)
	{
		case "DeletedMail":
			%ID = getField(%row,0);
			%senderQuad = getFields(%row,1,4);
			%recipientQuad = getFields(%row,5,8);
			%created  = getField(%row,9);
			%isCC = getField(%row,10);
			%isDel = getField(%row,11);
			%isRead = getField(%row,12);
			%TList = getField(%row,13);
			%CCList = getField(%row,14);
			%subject = getField(%row,15);
			%bodyCount = getField(%row,16);
			%body = getFields(%row,17);
			%msg = %ID NL %senderQuad NL %isRead NL %created NL %TList NL %CCList NL %subject NL %body @ "\n";
			%this.message = %msg;
			EmailMessageVector.pushBackLine(%this.message, getField(%this.message, 0));
			if(%isLastRow)
				%this.outputVector();
		case "NewMail":			
			%this.checkingEmail = "";
			%ID = getField(%row,0);
			%senderQuad = getFields(%row,1,4);
			%recipientQuad = getFields(%row,5,8);
			%created  = getField(%row,9);
			%isCC = getField(%row,10);
			%isDel = getField(%row,11);
			%isRead = getField(%row,12);
			%TList = getField(%row,13);
			%CCList = getField(%row,14);
			%subject = getField(%row,15);
			%bodyCount = getField(%row,16);
			%body = getFields(%row,17);
			%msg = %ID NL %senderQuad NL %isRead NL %created NL %TList NL %CCList NL %subject NL %body @ "\n";
			%this.message = %msg;
			EmailNewMessageArrived( %msg, %id );
//			$EmailNextSeq = %ID;
//			EmailMessageVector.pushBackLine(%this.message, getField(%this.message, 0));
			if(!%this.soundPlayed)
			{
				if(!getRecord(%this.message, 2))//are there any unread messages in this group?
				{
					%this.soundPlayed = true;
					alxPlay(sGotMail, 0, 0, 0);
				}
			}

			if(%isLastRow)
			{
				EmailGui.dumpCache();
				EmailGui.loadCache();
				%this.checkingEmail = false;
		   		%this.checkSchedule = schedule(1000 * 60 * 5, 0, CheckEmail, true);
//				echo("scheduling Email check " @ %this.checkSchedule @ " in 5 minutes");
			}
	}
}
//-----------------------------------------------------------------------------
function EmailGui::getCache(%this)
{
	EM_Browser.clear();
	EMailMessageVector.clear();
	EmailInboxBodyText.setText("");
	%fileName = $EmailCachePath @ $EmailFileName;
   %file = new FileObject();
   if ( %this.cacheFile $= "" )
   {
   		if ( %file.openForRead( %fileName ) )
        {
            %guid = %file.readLine();
            if ( %guid $= getField( WonGetAuthInfo(), 3 ) )
            {
               // This is the right one!
               %this.cacheFile = $EmailFileName;
               %this.messageCount = %file.readLine();
               while( !%file.isEOF() )
               {
                  %line = %file.readLine();
                  %id = firstWord( %line );
                  %msg = collapseEscape( restWords( %line ) );
   				  $EmailNextSeq = %id;
				  EMailMessageVector.pushBackLine(%msg, %id);
               }
               %file.close();
            }
         }
   }
   else if ( %file.openForRead( %fileName ) )
   {
      %guid = %file.readLine();
      %this.messageCount = %file.readLine();
      while( !%file.isEOF() )
      {
         %line = %file.readLine();
         %id = firstWord( %line );
         %msg = collapseEscape( restWords( %line ) );
		 $EmailNextSeq = %id;
		 EMailMessageVector.pushBackLine(%msg, %id);
      }
      %file.close();
   }
   %file.delete();
   %this.cacheLoaded = true;
}
//-----------------------------------------------------------------------------
function EmailGui::outputVector(%this)
{
   for(%i = 0; %i < EmailMessageVector.getNumLines(); %i++)
      EmailMessageAddRow(EmailMessageVector.getLineText(%i),
            EmailMessageVector.getLineTag(%i));
   EM_Browser.setSelectedRow( 0 );
}
//-----------------------------------------------------------------------------
function EmailGui::loadCache( %this )
{
   EM_Browser.clear();
   EMailMessageVector.clear();
   EMailInboxBodyText.setText("");
   %fileName = $EmailCachePath @ $EmailFileName;
   %file = new FileObject();
   if ( %this.cacheFile $= "" )
   {
         if ( %file.openForRead( %fileName ) )
         {
            %guid = %file.readLine();
            if ( %guid $= getField( WonGetAuthInfo(), 3 ) )
            {
               // This is the right one!
               %this.cacheFile = $EmailFileName;
               %this.messageCount = %file.readLine();
               while( !%file.isEOF() )
               {
                  %line = %file.readLine();
                  %id = firstWord( %line );
                  %msg = collapseEscape( restWords( %line ) );
                  EmailNewMessageArrived( %msg, %id );
               }
               %file.close();
            }
         }
   }
   else if ( %file.openForRead( %fileName ) )
   {
      %guid = %file.readLine();
      %this.messageCount = %file.readLine();
      while( !%file.isEOF() )
      {
         %line = %file.readLine();
         %id = firstWord( %line );
         %msg = collapseEscape( restWords( %line ) );
         EmailNewMessageArrived( %msg, %id );
      }
      %file.close();
   }
   %file.delete();
   %this.cacheLoaded = true;
}
//-----------------------------------------------------------------------------
function EmailGui::dumpCache( %this )
{
   %guid = getField( WONGetAuthInfo(), 3 );
   if ( %this.cacheFile $= "" ) %this.cacheFile = $EmailFileName;
   EmailMessageVector.dump( $EmailCachePath @ %this.cacheFile, %guid );
}
//-----------------------------------------------------------------------------
function EmailGui::onSleep( %this )
{
}
//-----------------------------------------------------------------------------
function EMailGui::getEmail(%this,%fromSchedule)
{
	checkEmail(%fromSchedule);
}
//-----------------------------------------------------------------------------
function EmailGui::setKey( %this, %key )
{
}
//-----------------------------------------------------------------------------
function EmailGui::onClose( %this, %key )
{
}
//-- EM_Browser --------------------------------------------------------------
function EM_Browser::onAdd( %this )
{
   if ( !EMailGui.initialized )
   {
		// Add the columns with widths from the prefs:
		for ( %i = 0; %i < $EmailColumnCount; %i++ )
			EM_Browser.addColumn( %i, $EmailColumnName[%i], $pref::Email::Column[%i], firstWord( $EmailColumnRange[%i] ), getWord( $EmailColumnRange[%i], 1 ) );

		EM_Browser.setSortColumn( $pref::Email::SortColumnKey );
		EM_Browser.setSortIncreasing( $pref::Email::SortInc );

		// Set the minimum extent of the frame panes:
		%minExtent = EM_BrowserPane.getMinExtent();
		EM_Frame.frameMinExtent( 0, firstWord( %minExtent ), restWords( %minExtent ) );
		%minExtent = EM_MessagePane.getMinExtent();
		EM_Frame.frameMinExtent( 1, firstWord( %minExtent ), restWords( %minExtent ) );

		EmailGui.initialized = true;
   }
}
//-----------------------------------------------------------------------------
function EM_Browser::onSelect( %this, %id )
{
    %text = EmailMessageVector.getLineTextByTag(%id);
	if(rbinbox.getValue())
	{
	   if(!getRecord(%text, 2)) // read flag
	   {
	        %line = EmailMessageVector.getLineIndexByTag(%id);
	        %text = setRecord(%text, 2, 1);
			DatabaseQuery(7, %id);
	      // Update the GUI:
	      %this.setRowFlags( %id, 1 );
	      EmailMessageVector.deleteLine(%line);
	      EmailMessageVector.insertLine(%line, %text, %id);
	      EmailGui.dumpCache();
	   }
	}
	EmailInboxBodyText.setValue(EmailGetTextDisplay(%text));
	EM_ReplyBtn.setActive( true );
	EM_ReplyToAllBtn.setActive( true );
	EM_ForwardBtn.setActive( true );
	EM_DeleteBtn.setActive( true );
	EM_BlockBtn.setActive( true );
}
//-----------------------------------------------------------------------------
function EM_Browser::onSetSortKey( %this, %sortKey, %isIncreasing )
{
   $pref::Email::SortColumnKey = %sortKey;
   $pref::Email::SortInc = %isIncreasing;
}
//-----------------------------------------------------------------------------
function EM_Browser::onColumnResize( %this, %column, %newSize )
{
   $pref::Email::Column[%column] = %newSize;
}

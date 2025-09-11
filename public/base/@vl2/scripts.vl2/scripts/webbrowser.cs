//==-- FUNCTIONS -------------------------------------------------------------
//$strcheck = "14 :  <  >  *  ^  |  ~  @  %  &  /  \\ `  \"";
//$strcheck = "13 :  <  >  *  ^  ~  @  %  &  /  \\ `  \"";
$strcheck = "7\t<\t>\t:\t%\t\\\t/\t\"";
$strcheck2 = "5\t<\t>\t:\t%\t\\";

$playerGfx = "texticons/twb/twb_default.jpg";
$tribeGfx = "texticons/twb/twb_default.jpg";

//-----------------------------------------------------------------------------
if(!isObject(TProfileHdr))
{
   new GuiControl(TProfileHdr);
}
//-----------------------------------------------------------------------------
function BrowserSearchDone()
{
   Canvas.popDialog(BrowserSearchDlg);
   %id = BrowserSearchMatchList.getSelectedId();
   if(%id != -1)
   {
      if(BrowserSearchPane.query $= 4)
         TWBTabView.view(getField(BrowserSearchMatchList.getRowTextById(%id), 1), "Tribe");
      else
         TWBTabView.view(getField(BrowserSearchMatchList.getRowTextById(%id), 0), "Warrior");
   }
}
//-----------------------------------------------------------------------------
function TextCheck2(%text,%handler)
{
   %handler.textCheck = 0;
   for(%i=1;%i<getField($strcheck2,0);%i++)
   {
      %pos=strStr(%text,getField($strcheck2,%i));
      if(%pos > -1)
      {
         %handler.textCheck=1;
         break;
      }
   }
}
//-----------------------------------------------------------------------------
function TextCheck(%text,%handler)
{
   %handler.textCheck = 0;
   for(%i=1;%i<getField($strcheck,0);%i++)
   {
      %pos=strStr(%text,getField($strcheck,%i));
      if(%pos > -1)
      {
         %handler.textCheck=1;
         break;
      }
   }
}
//-----------------------------------------------------------------------------
function BrowserStartSearch()
{
   if(trim($BrowserSearchField) $="" || trim($BrowserSearchField) $="_")
   {
      MessageBoxOK("NOTICE","Blank/Underline searches are not allowed, enter one or more characters of text and try again.","Search_EditField.makeFirstResponder(1);");
   }
   else
    {
      TextCheck($BrowserSearchField,BrowserSearchPane);
      if(!BrowserSearchPane.textCheck)
      {
            BrowserSearchPane.key = LaunchGui.key++;
         if(BrowserSearchPane.query==3)
            BrowserSearchPane.state = "warriorSearch";
         else
               BrowserSearchPane.state = "tribeSearch";

         BrowserSearchMatchList.clear();
            canvas.SetCursor(ArrowWaitCursor);
         if(isEventPending(TribeAndWarriorBrowserGui.eid))
            cancel(TribeAndWarriorBrowserGui.eid);

         TribeAndWarriorBrowserGui.eid = schedule(250,0,ExecuteSearch,0,BrowserSearchPane);
      }
      else
      {
         for(%x=0;%x<getField($strcheck,0);%x++)
         {
            %msgStr = %msgStr @ getField($strcheck,1+%x) @ " ";
         }
         MessageBoxOK("NOTICE","The Following Characters may not be used as search criteria:\n" NL 
                          %msgStr,"Search_EditField.makeFirstResponder(1);");
      }
   }
}
//-----------------------------------------------------------------------------
function ExecuteSearch(%id)
{
   DatabaseQueryArray(BrowserSearchPane.query,0,trim($BrowserSearchField) TAB 0 TAB 100 TAB 0, BrowserSearchPane, BrowserSearchPane.key, true);
}
//-----------------------------------------------------------------------------
function getTribeMember(%tribeName)
{
   %bResult = false;
   %CRec = wonGetAuthInfo();
   for(%tribeNo = 0;%tribeNo < getField(getRecord(%CRec,1),0); %tribeNo++)
   {
      if(strupr(%tribeName) $= strupr(getField(getRecord(%CRec,2+%tribeNo),0)))
         %bResult = true;
   }  
   return %bResult;
}
//-----------------------------------------------------------------------------
function CreateTribe()
{
   $CreateTribeName = "";
   $CreateTribeTag = "";
   $CreateTribeAppend = true;
   $CreateTribeRecruiting = true;

   if ( isObject( CreateTribeDlg ) )
      CreateTribeDlg.delete();

   LoadGui( CreateTribeDlg );
   Canvas.pushDialog( CreateTribeDlg );
}
//-----------------------------------------------------------------------------
function CreateTribeProcess()
{
   %text = CreateTribeDescription.getValue();
   if ( trim( $CreateTribeName ) !$= "" )
   {
      TextCheck( trim( $CreateTribeName ), CreateTribeDlg );
      if( CreateTribeDlg.textCheck == 1 )
      {
         %ErrVar="CTN";
         %proceed = 0;
      }
      else
         %proceed = 1;
         
      if( trim( $CreateTribeTag ) !$= "" && %proceed == 1 )
      {
         TextCheck( trim( $CreateTribeTag ), CreateTribeDlg );
         if ( CreateTribeDlg.textCheck == 1 )
         {
            %ErrVar="CTT";
            %proceed=0;
         }
         else
            %proceed = 1;
      }
      else
      {
         %proceed = 0;
         MessageBoxOK( "WARNING", "Tribe Tag cannot be blank." );
      }
   }
   else
   {
      %proceed = 0;
      MessageBoxOK( "WARNING", "Tribe Name cannot be blank." );
   }

   if ( %proceed == 1 )
   {
      CreateTribeDlg.key = LaunchGui.key++;
      CreateTribeDlg.state = "createTribe";
      canvas.SetCursor(ArrowWaitCursor);
      DatabaseQuery( 16, $CreateTribeName TAB
            $CreateTribeTag TAB
            $CreateTribeAppend TAB
            $CreateTribeRecruiting TAB
            getRecordCount(%text) TAB
            %text,
            CreateTribeDlg,
            CreateTribeDlg.key );

//       Canvas.popDialog(CreateTribeDlg);
   }
   else
   {
      switch$( %ErrVar )
      {
         case "CTN":
            %msg = "Tribe Name contains illegal characters, please correct it.";
         case "CTT":
            %msg = "Tribe Tag contains illegal characters, please correct it.";
         default: %msg = "Please Double Check Your Entries.";
      }
      MessageBoxOK("WARNING",%msg);
   }
}
//-----------------------------------------------------------------------------
function LaunchBrowser( %pane, %type )
{
   LaunchTabView.viewTab( "BROWSER", TribeAndWarriorBrowserGui, 0 );

   if ( %pane !$= "" && ( %type $= "Warrior" || %type $= "Tribe" ) )
      TWBTabView.view( %pane, %type );
}
//-----------------------------------------------------------------------------
function EditDescriptionApply()
{
   %desc = EditDescriptionText.getValue();
   TProfileHdr.Desc = %desc;
   if(TWBText.editType $= "tribe")
   {
      TribePane.key = LaunchGui.key++;
      TribePane.state = "editTribeDesc";
        canvas.SetCursor(ArrowWaitCursor);
      DatabaseQuery(15,TProfileHdr.tribename TAB getRecordCount(%desc) TAB %desc,TribePane,TribePane.key);
   }
   else
   {
     TWBText.key = LaunchGui.key++;
      TWBText.state = "editWarriorDesc";
      canvas.SetCursor(ArrowWaitCursor);
     DatabaseQuery(17,TProfileHdr.Desc, TWBText, TWBText.key);
   }
}
//-----------------------------------------------------------------------------
function GetProfileHdr(%type, %line)
{
   $GuidTribes = getRecords(wonGetAuthInfo(),1);
   if(%type==0)
   {     
      TProfileHdr.tribeID = getField(%line,0);
      TProfileHdr.tribeName = getField(%line,1);
      TProfileHdr.tribeTag = getField(%line,2);
      TProfileHdr.appending = getField(%line,3);
      TProfileHdr.recruiting = getField(%line,4);
      TProfileHdr.tribegfx = getField(%line,5);
      TProfileHdr.twa = 0;
      TProfileHdr.Desc = "";

      TL_Profile.setVisible(1);
      TL_Roster.setVisible(1);
      TL_News.setVisible(1);
       for(%checkID=0;%checkID<getField(getRecord($GuidTribes,0),0);%checkID++)
       {
           if(getField(getRecord($GuidTribes,1+%checkID),3) == 1401)
               TProfileHdr.twa = 4;
           else 
            if(TProfileHdr.tribeid == getField(getRecord($GuidTribes,1+%checkID),3))
            if(TProfileHdr.twa == 0)
                  TProfileHdr.twa =  getField(getRecord($GuidTribes,1+%checkID),4);
       }
   

      if(TProfileHdr.twa > 1)
      {
         TW_Admin.setVisible(1);
         TL_Invites.setVisible(1);
      }
      else
      {
         TW_Admin.setVisible(0);
         TL_Invites.setVisible(0);
      }
   }
   else
   {
      TProfileHdr.playerName = getField(%line,0);
      TProfileHdr.playerTag = getField(%line,1);
      TProfileHdr.appending = getField(%line,2);
      TProfileHdr.playerID = getField(%line,3);
      TProfileHdr.registered = getField(%line,4);
      TProfileHdr.onLine = getField(%line,5);
      TprofileHdr.playerURL = getField(%line,6);
      TProfileHdr.playerGFX = getField(%line,7);
      TProfileHdr.twa = 0;
      TProfileHdr.Desc = "";

      if(getField(getRecord(WonGetAuthInfo(),0),3)==getField(%line,3))
         TProfileHdr.twa = 1;

       for(%checkID=0;%checkID<getField(getRecord($GuidTribes,0),0);%checkID++)
       {
           if(getField(getRecord($GuidTribes,1+%checkID),3) == 1401 && getField(getRecord($GuidTribes,1+%checkID),4) >= 2)
               TProfileHdr.twa = 1;
       }

      W_Profile.setVisible(1);
      W_History.setVisible(1);
      W_Tribes.setVisible(1);

      %isMe = getField(getRecord(wonGetAuthInfo(),0),0)$=twbTitle.name;
      TProfileHdr.isMe = %isMe;

//    if(!TProfileHdr.twa)
      TProfileHdr.twa = TProfileHdr.isMe;

      if(TProfileHdr.twa)
      {
         W_BuddyList.setText("BUDDYLIST");
         W_BuddyList.setVisible(1);
         W_BuddyList.command = "PlayerPane.ButtonClick(3);";
         W_BuddyList.groupNum = 5;
         W_Admin.setVisible(1);
      }
      else
      {
         W_BuddyList.setText("OPTIONS");
         W_BuddyList.setVisible(1);
         W_BuddyList.command = "PlayerPane.ButtonClick(4);";
         W_BuddyList.groupNum = 4;
         W_Admin.setVisible(0);
      }
   }
}
//-----------------------------------------------------------------------------
function getTribeLinkName(%text, %offset)
{
   %name = getField(%text, %offset);
   %tag = getField(%text, %offset+1);
   return "<a:tribe" TAB %name @ ">" @ %name @ " - " @ %tag @ "</a>";
}
//-----------------------------------------------------------------------------
function getTribeName(%text, %offset)
{
   return getField(%text, %offset) @ " - " @ getField(%text, %offset + 1) TAB getField(%text, %offset);
}
//-----------------------------------------------------------------------------
function SearchTribes()
{
   if(BrowserSearchPane.query !$= 4)
   {
      // clear out the fields...
      $BrowserSearchField = "";
      BrowserSearchMatchList.clear();
   }

   Canvas.pushDialog(BrowserSearchDlg);
   Search_EditField.makeFirstResponder(1);
   BrowserSearchPane.setTitle("TRIBE SEARCH");
   BrowserSearchPane.query = 4;
}
//-----------------------------------------------------------------------------
function KillTribe(%tribe)
{
   TWBTabView.closeCurrentPane();
   Canvas.popDialog(TribePropertiesDlg);
   TribePane.key = LaunchGui.key++;
   TribePane.state = "killTribe";
    canvas.SetCursor(ArrowWaitCursor);
   DatabaseQuery(18,%tribe,TribePane,TribePane.key);
}
//-----------------------------------------------------------------------------
function LinkClearBuddylist(%owner,%handler)
{
   %owner.key = LaunchGui.key++;
   %owner.state = %handler;
    canvas.SetCursor(ArrowWaitCursor);
   DatabaseQuery(26,"clearBuddy", %owner, %owner.key);   
}
//-----------------------------------------------------------------------------
function LinkRemoveBuddy(%player, %owner, %handler)
{
   %owner.key = LaunchGui.key++;
   %owner.state = %handler;
    canvas.SetCursor(ArrowWaitCursor);
   DatabaseQuery(11, %player, %owner, %owner.key);
}
//-----------------------------------------------------------------------------
function LinkAddBuddy(%player, %owner, %handler)
{
   %owner.key = LaunchGui.key++;
   %owner.state = %handler;
    canvas.SetCursor(ArrowWaitCursor);
   DatabaseQuery(10, %player, %owner, %owner.key);
}
//-----------------------------------------------------------------------------
function LinkBlockPlayer(%blockAddress,%owner,%state)
{
    EMailBlockDlg.state = "setBlock";
   EMailBlockDlg.key = LaunchGui.key++;
    canvas.SetCursor(ArrowWaitCursor);
   DatabaseQuery(9,%blockAddress,EmailBlockDlg,EMailBlockDlg.key);
}
//-----------------------------------------------------------------------------
function LinkEditWarrior()
{
   MessageBoxOK( "NOT YET", "This feature has not yet been implemented." );
}
//-----------------------------------------------------------------------------
function LinkEditWarriorDesc(%player, %handler)
{
      Canvas.pushDialog(BrowserEditInfoDlg);
      EditDescriptionText.setValue(TProfileHdr.Desc);
}
//-----------------------------------------------------------------------------
function LinkEditMember(%player, %tribe, %pv, %title,%owner)
{
//      initialize buttons
        tb_onProbation.setVisible(true);
         tb_tribeMember.setVisible(false);          
         tb_tribeAdmin.setVisible(false);
         tb_tribeController.setVisible(false);
         tb_sysAdmin.setVisible(false);

         tb_onProbation.setValue(false);
         tb_tribeMember.setValue(false);
         tb_tribeAdmin.setValue(false);
         tb_tribeController.setValue(false);
         tb_sysAdmin.setValue(false);

        %owner.vTribe = %tribe;
        %owner.vPlayer = %player;
        t_whois.setValue(%player);
         E_Title.setValue(%title);

        %ai = wonGetAuthInfo();

        // Get callers rank in members tribe
        for(%i=0;%i<getfield(getRecord(%ai,1),0);%i++)
        {
         if( getField(getRecord(%ai,2+%i),0) $= %tribe || (getField(getRecord(%ai,2+%i),3)==1401 && getField(getRecord(%ai,2+%i),4)>1))
         {
            %callerPv = getField(getRecord(%ai,2+%i),4);
            break;
         }
        }

        if(%callerPv > %pv)
            %rnk = %callerPv;
        else
            %rnk = %pv;

        %owner.vPerm = %rnk;

        if(getField(getRecord(%ai,0),0) $= getField(twbTitle.getValue(),0)) //if the caller is the member to be edited
        {
            switch( %pv )
            {
               case 0:
                 tb_onProbation.setValue(true);
               case 1:
                  tb_tribeMember.setValue(true);
                   tb_tribeMember.setVisible(true);          
               case 2:
                   tb_tribeMember.setVisible(true);          
                      tb_tribeAdmin.setVisible(true);
                 tb_tribeAdmin.setValue(true);
               case 3:
                   tb_tribeMember.setVisible(true);          
                   tb_tribeAdmin.setVisible(true);
                   tb_tribeController.setVisible(true);
                  tb_tribeController.setValue(true);
               case 4:
                   tb_tribeMember.setVisible(true);          
                   tb_tribeAdmin.setVisible(true);
                   tb_tribeController.setVisible(true);
                tb_sysAdmin.setVisible(true);
                 tb_sysAdmin.setValue(true);
           }
        }
        else
        {
           switch( %rnk )
           {
            case 1:
                  tb_tribeMember.setVisible(true);
            case 2:
                  tb_tribeMember.setVisible(true);
                  tb_tribeAdmin.setVisible(true);
            case 3:
                  tb_tribeMember.setVisible(true);
                  tb_tribeAdmin.setVisible(true);
                  tb_tribeController.setVisible(true);
            case 4:
                  tb_tribeMember.setVisible(true);
                  tb_tribeAdmin.setVisible(true);
                  tb_tribeController.setVisible(true);
               tb_sysAdmin.setVisible(true);
           }

            switch( %pv )
            {
               case 0:
                 tb_onProbation.setValue(true);
               case 1:
                  tb_tribeMember.setValue(true);
               case 2:
                  tb_tribeAdmin.setValue(true);
               case 3:
                  tb_tribeController.setValue(true);
               case 4:
                  tb_sysAdmin.setValue(true);
           }
         }
         Canvas.pushDialog(%owner);
}
//-----------------------------------------------------------------------------
function LinkLeaveTribe(%player,%handler)
{
   %handler.key = LaunchGui.key++;
   %handler.state = "leaveTribe";
    canvas.SetCursor(ArrowWaitCursor);
   %handler.leavingTribe = %player;
   DatabaseQuery(24,%player,%handler,%handler.key);
}
//-----------------------------------------------------------------------------
function LinkKickMember(%player, %tribe, %owner)
{
   %owner.warrior = %player;
   %owner.tribe = %tribe;
   TribePane.key = LaunchGui.key++;
   TribePane.state = "kickPlayer";
    canvas.SetCursor(ArrowWaitCursor);
   DatabaseQuery(19,%player TAB %tribe TAB 0,TribePane,TribePane.key);
}
//-----------------------------------------------------------------------------
function LinkMakePrimary(%action, %field, %owner)
{
   %owner.key = LaunchGui.key++;
   %owner.state = %action;
    canvas.SetCursor(ArrowWaitCursor);
   DatabaseQuery(25,%field,%owner,%owner.key);
}
//-----------------------------------------------------------------------------
function LinkTribeToggle(%action, %field, %owner, %handler)
{
   TribePane.key = LaunchGui.key++;
   TribePane.state = "toggleTribe" @ %action;
    canvas.SetCursor(ArrowWaitCursor);
   DatabaseQuery(20,%action TAB %field,TribePane,TribePane.key);
}
//-----------------------------------------------------------------------------
function LinkInvitePlayer(%tribe, %player, %owner, %handler)
{
   %owner.key = LaunchGui.key++;
   %owner.state = %handler;
    canvas.SetCursor(ArrowWaitCursor);
   DatabaseQuery(27,%tribe TAB %player,%owner,%owner.key);
}
//-----------------------------------------------------------------------------
function LinkTribeTag(%owner)
{
   Canvas.pushDialog(%owner);
}
//-----------------------------------------------------------------------------
function LinkBrowser(%player , %tabtype)
{
   LaunchBrowser(%player , %tabtype);
}
//-----------------------------------------------------------------------------
function LinkForum(%forum, %topic)
{
   ForumsTopicsList.refreshFlag = true;
   LaunchForums( %forum, %topic );
}
//-----------------------------------------------------------------------------
function LinkWeb(%url)
{
   gotoWebPage( %url );
}
//-----------------------------------------------------------------------------
function LinkInvitation(%action, %tribe, %player, %owner)
{
   %owner.key = LaunchGui.key++;
   switch$(%action)
   {
      case "cancel":
         %owner.state = "cancelInvite";
      case "accept":
         %owner.state = "acceptInvite";
      case "reject":
         %owner.state = "rejectInvite";
   }
    canvas.SetCursor(ArrowWaitCursor);
   DatabaseQuery(28,%action TAB %tribe TAB %player,%owner,%owner.key);
}
//-----------------------------------------------------------------------------
function LinkEMail(%MailTo)
{
    Email_ToEdit.setText(%MailTo);
    Email_CCEdit.setText("");
    $EmailSubject = "";
    Canvas.pushDialog(EmailComposeDlg);
    EmailBodyText.setValue("");
   Email_Subject.makeFirstResponder(1);
}
//-----------------------------------------------------------------------------
function LinkEMailTribe(%MailTo)
{
//	error("LEMT: " @ %MailTo);
	%toList = "";
	%ccList = "";
	%curLen = 0;	
	%toggle = 0;
	for(%x = 0; %x < MemberList.rowCount(); %x++)
	{
//		%curLen = StrLen(%toList);
		%cWord = getField(MemberList.getRowText(%x),0);
//		if( (%curLen + StrLen(%cWord) + 1) <= 2000 )
		if (%toggle == 0)
		{
//			error("ToList Adding: " @ %cWord TAB %curLen TAB %x);
			%toList = %toList @ %cWord @ ",";
			%toggle++;
//			Email_ToEdit.setText(Email_ToEdit.getValue() @ %cWord @ ",");
		}
		else
		{
//			error("CCList Adding: " @ %cWord TAB %curLen TAB %x);
//			Email_CCEdit.setText(Email_CCEdit.getValue() @ %cWord @ ",");
			%ccList = %ccList @ %cWord @ ",";
			%toggle = 0;
		}
	}
//	error("TOLIST: " @ strLen(%toList) NL %toList);
  //rror("CCList: " @ strLen(%ccList) NL %ccList);
	Email_ToEdit.setValue(getSubStr(%toList,0,Email_ToEdit.maxLength));
	Email_CCEdit.setValue(getSubStr(%ccList,0,Email_CCEdit.maxLength));
	$EmailSubject = "";
	EmailBodyText.setValue("");
	Canvas.pushDialog(EmailComposeDlg);
	Email_Subject.makeFirstResponder(1);
}
//-----------------------------------------------------------------------------
function SearchWarriors()
{
   if(BrowserSearchPane.query !$= 3)
   {
      // clear out the fields...
      $BrowserSearchField = "";
      BrowserSearchMatchList.clear();
   }
   Canvas.pushDialog(BrowserSearchDlg);
   BrowserSearchPane.setTitle("WARRIOR SEARCH");
   BrowserSearchPane.query = 3;
   Search_EditField.makeFirstResponder(1);
}
//-----------------------------------------------------------------------------
function SetMemberProfile()
{
  if(strLen(trim(E_Title.getValue)) <= 0)
  {
   TextCheck(E_Title.getValue(),TribeAdminMemberDlg);
   if(TribeAdminMemberDlg.textCheck==0)
   {
         TribeAdminMemberDlg.key = LaunchGui.key++;
         TribeAdminMemberDlg.state = "setMemberProfile";
       canvas.SetCursor(ArrowWaitCursor);
      %title = E_Title.getValue();
      DatabaseQuery(21,TribeAdminMemberDlg.vTribe TAB
                  TribeAdminMemberDlg.vPlayer TAB
                  %title TAB
                  TribeAdminMemberDlg.vPerm,
                  TribeAdminMemberDlg,
                  TribeAdminMemberDlg.key);

      Canvas.popDialog(TribeAdminMemberDlg);
   }
   else
   {
      MessageBoxOK("WARNING","Member Title contains illegal characters.  Please correct and try again.");
   }
  }
  else
   MessageBoxOK("WARNING","Member Title cannot be blank...really.");
}
//-----------------------------------------------------------------------------
function TAM_OnAction(%caller)
{
  TribeAdminMemberDlg.vPerm = %caller;
}
//-----------------------------------------------------------------------------
function updateTribeTagPreview()
{
   %warrior = getField( WONGetAuthInfo(), 0 );

   // Validate the tribe tag:
   %tag = CT_TagText.getValue();
   %realTag = StripMLControlChars( %tag );
   if ( %tag !$= %realTag )
      CT_TagText.setValue( %realTag );

   if ( $CreateTribeAppend )
      CT_PreviewText.setValue( %warrior @ %realTag );
   else
      CT_PreviewText.setValue( %realTag @ %warrior );
}

//-- TribeAndWarriorBrowserGui -----------------------------------------------
function TribeAndWarriorBrowserGui::onWake(%this)
{   
   MemberList.ClearColumns();
   W_MemberList.ClearColumns();
   MemberList.Clear();
   W_MemberList.clear();
   Canvas.pushDialog(LaunchToolbarDlg);

   if ( TWBTabView.tabCount() == 0 )
   {
      %info = WONGetAuthInfo();

      // Open the player's page:
      %warrior = getField( %info, 0 );
      TWBTabView.view( %warrior, "Warrior" );
     w_profile.setValue(1);

      // Add tabs for the player's tribal pages:
      %tribeCount = getField( getRecord( %info, 1 ), 0 ); //%cert
      for ( %i = 0; %i < %tribeCount; %i++ )      
      {
         %tribe = getField( getRecord( %info, %i + 2 ), 0 ); //%cert
         TWBTabView.addTab( %i + 1, %tribe, 1 );
      }
   }
   else if(PlayerPane.visible)
      PlayerPane.onWake();
   else
      TribePane.onWake();
}
//-----------------------------------------------------------------------------
function TribeAndWarriorBrowserGui::setKey( %this, %key )
{
}
//-----------------------------------------------------------------------------
function TribeAndWarriorBrowserGui::onClose( %this, %key )
{
}
//-----------------------------------------------------------------------------
function TribeAndWarriorBrowserGui::connectionTerminated( %this, %key )
{
   if ( %key != %this.key )
      return;
}
//-----------------------------------------------------------------------------
function TribeAndWarriorBrowserGui::onSleep(%this)
{
   if (TribeAndWarriorBrowserGui.WDialogOpen)
      WarriorPopupDlg.forceClose();

   if (TribeAndWarriorBrowserGui.TDialogOpen)
      TribeMemberPopupDlg.forceClose();

   Canvas.popDialog(LaunchToolbarDlg);
}
//==--  CreateTribeDlg -------------------------------------------------------
function CreateTribeDlg::onWake( %this )
{
   //rbAppendTab.setValue(1);
   updateTribeTagPreview();
}
//-----------------------------------------------------------------------------
function CreateTribeDlg::CreateTribe(%this)
{
   CreateTribeProcess();
}
//-----------------------------------------------------------------------------
function CreateTribeDlg::Cancel(%this)
{
   Canvas.PopDialog(CreateTribeDlg);
    $CreateTribeName = "";
    $CreateTribeTag = "";
   CreateTribeDlg.delete();

   if(isObject(CreateTribeDlg))
      CreateTribeDlg.delete();
}
//-----------------------------------------------------------------------------
function CreateTribeDlg::onDatabaseQueryResult(%this,%status,%resultString,%key)
{
   if ( %this.key != %key )
      return;
// echo("RECV: " @ %status);
   if(getField(%status,0)==0)
   {
      switch$(%this.state)
      {
         case "createTribe":
            TWBTabView.view( $CreateTribeName, "Tribe" );
               Canvas.popDialog(CreateTribeDlg);
             $CreateTribeName = "";
            $CreateTribeTag = "";
            if(isObject(CreateTribeDlg))
               CreateTribeDlg.delete();
            WonUpdateCertificate();
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
      MessageBoxOK("WARNING",getField(%status,1));
   }
   Canvas.setCursor(defaultCursor);
}
//-----------------------------------------------------------------------------
function CreateTribeDlg::onDatabaseRow(%this,%row,%isLastRow,%key)
{
   if( %this.key != %key )
      return;
// echo("RECV: " @ %row);
}
//==--  TribeAdminMemberDlg ---------------------------------------------------
function TribeAdminMemberDlg::onWake(%this)
{
   
}
//-----------------------------------------------------------------------------
function TribeAdminMemberDlg::onDatabaseQueryResult( %this, %status, %resultString, %key)
{
    if ( %this.key != %key )
      return;
 echo("RECV: " @ %status);
   if(getField(%status,0)==0)
   {
      switch$(%this.state)
      {
         case "setMemberProfile":
            %this.state = "done";
            ForumsTopicsList.refreshFlag = true;
			if (getField(%status,3) == getField(getRecord(WonGetAuthInfo(),0),3))
	            messageBoxOK("COMPLETE","Member Profile has been updated","WonUpdateCertificate();TL_Profile.setValue(1);");
			else
				messageBoxOK("COMPLETE",getField(%status,1));
      }
   }
   else if (getSubStr(getField(%status,1),0,9) $= "ORA-04061")
   {
      %this.state = "error";
      MessageBoxOK("ERROR","There was an error processing your request, please wait a few moments and try again.");
   }
   else
      messageBoxOK("WARNING",getField(%status,1));
   Canvas.setCursor(defaultCursor);
}
//-----------------------------------------------------------------------------
function TribeAdminMemberDlg::onDatabaseRow(%this,%row,%isLastRow,%key)
{
    if ( %this.key != %key )
      return;
// echo("RECV: " @ %row);
}
//-----------------------------------------------------------------------------
function TribeAdminMemberDlg::connectionTerminated( %this, %key )
{
   if ( %this.key != %key )
      return;

   if ( %this.errorState $= "OK" )
      TWBTabView.refresh(); 
}
//==--  BrowserSearchDlg -----------------------------------------------------
function BrowserSearchDlg::onWake( %this )
{
   if ( BrowserSearchMatchList.getSelectedId() == -1 )
      BSearchOKBtn.setActive( false );
}
//-----------------------------------------------------------------------------
function BrowserSearchPane::GetOnlineStatus(%this)
{
    %this.key = LaunchGui.key++;
    %this.status = "getOnline";
    for(%oStat=0;%oStat<BrowserSearchMatchList.RowCount();%oStat++)
    {
      if(%oStat == 0)
        %roster = getField(BrowserSearchMatchList.getRowText(%oStat),3);
      else
        %roster = %roster TAB getField(BrowserSearchMatchList.getRowText(%oStat),3);
    }
    databaseQuery(69,%roster,%this,%this.key);
}
//-----------------------------------------------------------------------------
function BrowserSearchMatchList::onSelect( %this, %id, %text )
{
   BSearchOKBtn.setActive( true );
}
//-----------------------------------------------------------------------------
function BrowserSearchMatchList::onAdd(%this)
{
// BrowserSearchMatchList.addStyle( 1, "Univers", 12 , "150 150 150", "200 200 200", "60 60 60" );
}
//==--  BrowserSearchPane ----------------------------------------------------
function BrowserSearchPane::onDatabaseQueryResult(%this, %status, %resultStatus, %key)
{
   if(%key != %this.key)
      return;
   echo("RECV: " @ %status);
   if(getField(%status,0)==0)
   {
      switch$(%this.state)
      {
         case "warriorSearch":
            if(getField(%resultStatus,0)<=0)
            {
               %this.state = "done";
               MessageBoxOK("NOTICE","No Players found");
            }
            else
            {
               %this.rowNum = -1;
               %this.state = "warrior";
            }
         case "tribeSearch":
            if(getField(%resultStatus,0)<=0)
            {
               %this.state = "done";
               MessageBoxOK("NOTICE","No Tribes found");
            }
            else
            {
               %this.rowNum = -1;
               %this.state = "tribe";
            }
         case "getOnline":
           //error("GONLINE:" @ %status TAB %resultString);
            if(getField(%status,0) == 0)
                   for(%str=0;%str<strLen(%resultString);%str++)
                   {
                     BrowserSearchMatchList.setRowStyle( %str, !getSubStr(%resultString,%str,1) );
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
      MessageBoxOK("WARNING",getField(%status,1));
   }
   canvas.setCursor(defaultCursor);
}
//-----------------------------------------------------------------------------
function BrowserSearchPane::onDatabaseRow(%this, %row, %isLastRow, %key)
{
   if(%key != %this.key)
      return;
// echo("RECV: " @ %row);
   switch$(%this.state)
   {
      case "tribe":
         %line = getTribeName(getFields(%row, 1),0) TAB getField(%row, 2);
         BrowserSearchMatchList.addRow(%this.rowNum++, %line);
         if(%isLastRow)
            %this.state = "done";
      case "warrior":
         %line = getFields(%row,1);
         BrowserSearchMatchList.addRow(%this.rowNum++, %line);
         if(%isLastRow)
         {
                %this.GetOnlineStatus();
            %this.state = "done";
         }
   }
}
//==--  TWBTabView -----------------------------------------------------------
function TWBTabView::onAdd( %this )
{
   %this.addSet( 1, "gui/shll_horztabbuttonB", "5 5 5", "50 50 0", "5 5 5" );
}
//-----------------------------------------------------------------------------
function TWBTabView::view(%this, %name, %type)
{
   if ( %type $= "Tribe" )
      %tabSet = 1;  
   else
      %tabSet = 0;  

   // If the tab is already in the group, select it:
   for(%i = 0; %i < %this.tabCount(); %i++)
   {
      if ( ( %this.getTabText( %i ) $= %name ) && ( %tabSet == %this.getTabSet( %i ) ) )
      {
         %this.setSelectedByIndex( %i );
         return;
      }
   }

   // Or else add the new tab:
   %this.addTab( %i, %name, %tabSet );
   %this.setSelectedByIndex(%i);
   TWBClosePaneBtn.setVisible(TWBTitle.name !$= getField(getRecord(wongetAuthInfo(),0),0));
}
//-----------------------------------------------------------------------------
function TWBTabView::refresh( %this )
{
   // Just re-select the selected tab:
   %this.setSelectedByIndex( %this.getSelectedTab() );
}
//-----------------------------------------------------------------------------
function TWBTabView::closeCurrentPane( %this )
{
   %id = %this.getSelectedId();
   %this.removeTab( %id );
}
//-----------------------------------------------------------------------------
function TWBTabView::onSelect(%this, %id, %text)
{
   MemberList.clear();
   W_MemberList.clear();
   TWBScroll.scrollToTop();
   TWBTitle.OldText = TWBTitle.name;
   TWBTitle.setValue( %text );   // This will get overwritten...
   TWBTitle.name = %text;
   TWBClosePaneBtn.setVisible(TWBTitle.name !$= getField(getRecord(wongetAuthInfo(),0),0));
   switch(%this.getTabSet( %id ))
   {
     case 0: // Warrior
      if(isObject(TProfileHdr))
      {
         TProfileHdr.delete();
            new GuiControl(TProfileHdr);
      }
      PlayerPane.setvisible(1);
      TribePane.setvisible(0);

      if(W_memberList.rowCount()<=0)
         PlayerPane.needRefresh = 1;
      else
         PlayerPane.needRefresh = 0;

       TWBTabFrame.setAltColor( false );
         TWBClosePaneBtn.setVisible(TWBTitle.name !$= getField(getRecord(wongetAuthInfo(),0),0));
      if(TWBTitle.OldText !$= TWBTitle.name)
        W_Profile.setValue(1);
      
      PlayerPix.setBitmap($playerGfx);
      W_Profile.setVisible(1);
      W_History.setVisible(1);
      W_Tribes.setVisible(1);
      %isMe = getField(getRecord(wonGetAuthInfo(),0),0)$=twbTitle.name;
      if(%isMe)
      {
         W_BuddyList.setText("BUDDYLIST");
         W_BuddyList.setVisible(1);
         W_BuddyList.command = "PlayerPane.ButtonClick(3);";
         W_BuddyList.groupNum = 5;
      }
      else
      {
         W_BuddyList.setText("OPTIONS");
         W_BuddyList.setVisible(1);
         W_BuddyList.command = "PlayerPane.ButtonClick(4);";
         W_BuddyList.groupNum = 4;
      }
      W_Admin.setVisible(getField(getRecord(wonGetAuthInfo(),0),0)$=twbTitle.name);

    case 1: // Tribe
      PlayerPane.setvisible(0);
      TribePane.setvisible(1);
      if(memberList.rowCount()<=0)
         TribePane.needRefresh = 1;
      else
         TribePane.needRefresh = 0;

       TWBTabFrame.setAltColor( true );
      if(TWBTitle.OldText !$= TWBTitle.name)
        TL_Profile.setValue(1);

//    %this.display();

   }
}
//==--  GUIMLTextCtrl --------------------------------------------------------
function GuiMLTextCtrl::onURL(%this, %url)
{
   %i = 0;
   while((%fld[%i] = getField(%url, %i)) !$= "")
      %i++;

   %tribe = %fld[1];
   %warrior = %fld[2];
   switch$(%fld[0])
   {
      case "player":
         LinkBrowser( %fld[1] , "Warrior");
      case "tribe":
         LinkBrowser( %fld[1], "Tribe" );
      case "forumlink":
         LinkForum(%fld[1], %fld[3]);
      case "wwwlink":
         LinkWeb( %fld[1] );
      case "cancelinvite":
         %tribe = %fld[1];
         %warrior = %fld[2];
         MessageBoxYesNo("CONFIRM", "Are you sure you wish to cancel the invitation for " @ %fld[1] @ " to join Tribe " @ %fld[2] @ "?",
         "LinkInvitation(\"cancel\"," @ %tribe @ "," @ %player @ ",\" TribePane \");","");
      case "acceptinvite":
         LinkInvitation("accept",%tribe,%warrior,PlayerPane);
      case "rejectinvite":
         LinkInvitation("reject",%tribe,%warrior,PlayerPane);
      case "email":
         LinkEMail(%fld[1]);
      case "massmail":
         LinkEMailTribe(%tribe);

      case "editwarrior":
         LinkEditWarrior();    
      case "editdescription":
         if(%fld[1])
            TWBText.editType = "warrior";
         LinkEditWarriorDesc(%fld[1],PlayerPane,"editWarriorDescription");
      case "editmember":
         LinkEditMember(%fld[1],%fld[2],%fld[3],%fld[4],TribeAdminMemberDlg);
      case "kickwarrior":
         MessageBoxYesNo("CONFIRM", "Are you sure you wish to kick " @ %fld[1] @ " from Tribe " @ %fld[2] @ "?",
                                       "LinkKickMember(" @ %fld[1] @ "," @ %fld[2] @ "," @ TribePane @ ");", "");
      case "makeprimarytribe":
         %this.tribe = %fld[1];
         MessageBoxYesNo("CONFIRM", "Are you sure you wish to make Tribe " @ %this.tribe @ " your primary tribe?",
                           "LinkMakePrimary(\"setPrimaryTribe\",\"" @ %this.tribe @ "\"," @ PlayerPane @ ",);","");
      case "noprimarytribe":
         %this.tribe = %fld[1];
         MessageBoxYesNo("CONFIRM", "Are you sure you wish to have no primary tribe?",
                           "LinkMakePrimary(\"setNoPrimaryTribe\",\"NONE\"," @ PlayerPane @ ",);","");
      case "leavetribe":
         %this.tribe = %fld[1];
         MessageBoxYesNo("CONFIRM", "Are you sure you wish to leave Tribe " @ %this.tribe @ "?",
                                          "LinkLeaveTribe(" @ %this.tribe @ ",\"playerPane \");","");

      case "changerecruiting":
         LinkTribeToggle("Recruiting", %fld[2] TAB %fld[1], %this, "togglerecruiting");
      case "changeappending":
         LinkTribeToggle("Appending", %fld[2] TAB %fld[1], %this, "toggleappending");
      case "invite":
         %this.tribe = %fld[2];
         %this.warrior = %fld[1];
         MessageBoxYesNo("CONFIRM", "Invite " @ %this.warrior @ " to join " @ %this.tribe @ "?",
                           "LinkInvitePlayer(\"" @ %this.tribe @ "\",\"" @ %this.warrior @ "\"," @ PlayerPane @ ",\"inviteWarrior\");","");

      case "changetribename":
         MessageBoxOK("INFORMATION","You are not allowed to change tribe names, you must instead disband your tribe and create another.");

      case "changetribetag":       
         LinkTribeTag(%this);  

      case "addBuddy":
         LinkAddBuddy(%fld[1],TWBText,"addBuddy");
      case "requestlink":
         TribePane.key = LaunchGui.key++;
         TribePane.state = "requestInvite";
         DatabaseQuery(34,TProfileHdr.tribename,TribePane,TribePane.key);

      case "gamelink":
         commandToServer('ProcessGameLink', %fld[1], %fld[2], %fld[3], %fld[4], %fld[5]);
// THESE ARE EMAIL RELATED MODERATOR LINKS
     case "moderatorTopicKill":
            TopicsPopupDlg.key = LaunchGui.key++;
            TopicsPopupDlg.state = "adminRemoveTopic";
            databaseQuery(62, 0 TAB getField(%url,1) TAB getField(%url,2), TopicsPopupDlg, TopicsPopupDlg.key);
     case "moderatorTopicWarn":
            TopicsPopupDlg.key = LaunchGui.key++;
            TopicsPopupDlg.state = "adminRemoveTopicPlus";
            //error("MTW: " @ %url);        
            databaseQuery(62, 1 TAB getField(%url,1) TAB getField(%url,2), TopicsPopupDlg, TopicsPopupDlg.key);
     case "moderatorTopicBan24":
            TopicsPopupDlg.key = LaunchGui.key++;
            TopicsPopupDlg.state = "adminRemoveTopicPlus";
            //error("MTB24: " @ %url);         
            databaseQuery(62, 2 TAB getField(%url,1) TAB getField(%url,2), TopicsPopupDlg, TopicsPopupDlg.key);
     case "moderatorTopicBan48":
            TopicsPopupDlg.key = LaunchGui.key++;
            TopicsPopupDlg.state = "adminRemoveTopicPlus";
            databaseQuery(62, 3 TAB getField(%url,1) TAB getField(%url,2), TopicsPopupDlg, TopicsPopupDlg.key);
     case "moderatorTopicBan72":
            TopicsPopupDlg.key = LaunchGui.key++;
            TopicsPopupDlg.state = "adminRemoveTopicPlus";
            databaseQuery(62, 4 TAB getField(%url,1) TAB getField(%url,2), TopicsPopupDlg, TopicsPopupDlg.key);
     case "moderatorTopicBan7Days":
            TopicsPopupDlg.key = LaunchGui.key++;
            TopicsPopupDlg.state = "adminRemoveTopicPlus";
            databaseQuery(62, 5 TAB getField(%url,1) TAB getField(%url,2), TopicsPopupDlg, TopicsPopupDlg.key);
     case "moderatorTopicBan30Days":
            TopicsPopupDlg.key = LaunchGui.key++;
            TopicsPopupDlg.state = "adminRemoveTopicPlus";
            databaseQuery(62, 6 TAB getField(%url,1) TAB getField(%url,2), TopicsPopupDlg, TopicsPopupDlg.key);
     case "moderatorTopicBanForever":
            TopicsPopupDlg.key = LaunchGui.key++;
            TopicsPopupDlg.state = "adminRemoveTopicPlus";
            databaseQuery(62, 7 TAB getField(%url,1) TAB getField(%url,2), TopicsPopupDlg, TopicsPopupDlg.key);

     case "moderatorPostKill":
            PostsPopupDlg.key = LaunchGui.key++;
            PostsPopupDlg.state = "adminRemovePost";
            databaseQuery(63, 0 TAB getFields(%url,1), PostsPopupDlg, PostsPopupDlg.key);
     case "moderatorPostWarn":
            PostsPopupDlg.key = LaunchGui.key++;
            PostsPopupDlg.state = "adminRemovePostPlus";
            databaseQuery(63, 1 TAB getFields(%url,1), PostsPopupDlg, PostsPopupDlg.key);
     case "moderatorPostBan24":
            PostsPopupDlg.key = LaunchGui.key++;
            PostsPopupDlg.state = "adminRemovePostPlus";
            databaseQuery(63, 2 TAB getFields(%url,1), PostsPopupDlg, PostsPopupDlg.key);
     case "moderatorPostBan48":
            PostsPopupDlg.key = LaunchGui.key++;
            PostsPopupDlg.state = "adminRemovePostPlus";
            databaseQuery(63, 3 TAB getFields(%url,1), PostsPopupDlg, PostsPopupDlg.key);
     case "moderatorPostBan72":
            PostsPopupDlg.key = LaunchGui.key++;
            PostsPopupDlg.state = "adminRemovePostPlus";
            databaseQuery(63, 4 TAB getFields(%url,1), PostsPopupDlg, PostsPopupDlg.key);
     case "moderatorPostBan7Days":
            PostsPopupDlg.key = LaunchGui.key++;
            PostsPopupDlg.state = "adminRemovePostPlus";
            databaseQuery(63, 5 TAB getFields(%url,1), PostsPopupDlg, PostsPopupDlg.key);
     case "moderatorPostBan30Days":
            PostsPopupDlg.key = LaunchGui.key++;
            PostsPopupDlg.state = "adminRemovePostPlus";
            databaseQuery(63, 6 TAB getFields(%url,1), PostsPopupDlg, PostsPopupDlg.key);
     case "moderatorPostBanForever":
            PostsPopupDlg.key = LaunchGui.key++;
            PostsPopupDlg.state = "adminRemovePostPlus";
            databaseQuery(63, 7 TAB getFields(%url,1), PostsPopupDlg, PostsPopupDlg.key);
     case "joinPublicChat":
         joinPublicTribeChannel(getField(%url,1));
     case "joinPrivateChat":
         joinPrivateTribeChannel(getField(%url,1));

      //if there is an unknown URL type, treat it as a weblink..
      default:
      LinkWeb( %fld[0] );
   }
}
//==-- TWBTEXT ---------------------------------------------------------------
function TWBText::onDatabaseQueryResult(%this,%status,%resultString,%key)
{
   if(%this.key != %key)
      return;
// echo("TWB RECV: " @ %status);
   if(getField(%status,0)==0)
   {
      switch$(%this.state)
      {
         case "editWarriorDesc":
            %this.state = "done";
            WP_WarriorDescription.setText(EditDescriptionText.getValue());
            Canvas.popDialog(BrowserEditInfoDlg);
            messageBoxOK("COMPLETE","Warrior Description Changed","W_profile.setValue(1);");
            WarriorPropertiesDlg.pendingChanges="";
         case "addBuddy":
            %this.state = "done";
            MessageBoxOK("COMPLETE",getField(%resultString,2) @ " was added to your buddylist");
      }
   }
   else if (getSubStr(getField(%status,1),0,9) $= "ORA-04061")
   {
      %this.state = "error";
      MessageBoxOK("ERROR","There was an error processing your request, please wait a few moments and try again.");
   }
   else
   {
      messageBoxOK("WARNING",getField(%status,1));
   }
   canvas.setCursor(defaultCursor);
}
//-----------------------------------------------------------------------------
function TWBText::onDatabaseRow(%this,%row,%isLastRow, %key)
{
   if(!%this.key == %key)
      return;
// echo("RECV: " @ %row);
}
//-----------------------------------------------------------------------------
function TWBText::connectionTerminated( %this, %key )
{
   TWBTabView.refresh();
}
//-----------------------------------------------------------------------------
//==-- TribePane --------------------------------------------------------------
//-----------------------------------------------------------------------------
function TribePane::onAdd(%this)
{
   // Add the popup menu:
   new GuiControl(TribeMemberPopupDlg) {
      profile = "GuiModelessDialogProfile";
      horizSizing = "width";
      vertSizing = "height";
      position = "0 0";
      extent = "640 480";
      minExtent = "8 8";
      visible = "1";
      setFirstResponder = "0";
      modal = "1";

      new ShellPopupMenu( TribeMemberPopup ) {
         profile = "ShellPopupProfile";
         position = "0 0";
         extent = "0 0";
         minExtent = "0 0";
         visible = "1";
         maxPopupHeight = "200";
         noButtonStyle = "1";
      };
   };
}
//-----------------------------------------------------------------------------
function TribePane::onWake(%this)
{  
   if(trim(TProfileHdr.tribegfx) !$= "")
      TeamPix.setBitmap(TProfileHdr.tribegfx);
   else
      TeamPix.setBitmap($TribeGfx);

   if(memberList.rowCount() <= 0)
   {
      %this.needRefresh = 1;
      tl_profile.setValue(1);
   }     
}
function TribePane::JoinChat(%this, %tribe, %chanType)
{
   if(%chanType == 0)
      joinPublicTribeChannel(%tribe);
   else
      joinPrivateTribeChannel(%tribe);
}
//-----------------------------------------------------------------------------
function TribePane::onDatabaseQueryResult(%this, %status, %resultString , %key)
{
  if ( %this.key != %key )
      return;
// echo("RECV: " @ %status);
   if(getField(%status,0)==0)
   {
      switch$(%this.state)
      {
         case "killTribe":
            %this.state = "done";            
            WonUpdateCertificate();
            TWBTabView.closeCurrentPane();
         case "editTribeDesc":
            %this.state = "done";
            TP_TribeDescription.setText(EditDescriptionText.getValue());
            TProfileHdr.desc = TP_TribeDescription;
            Canvas.popDialog(BrowserEditInfoDlg);
            TribePropertiesDlg.pendingChanges = "";
         case "kickPlayer":
            %this.state = "done";
            messageBoxOK("COMPLETE",getField(%status,1));
            WonUpdateCertificate();
         case "toggleTribeRecruiting":
            %this.state = "done";
         case "toggleTribeAppending":
            %this.state = "done";
            WonUpdateCertificate();
            %ntag = TP_NewTag.getValue();   
            %playerName = GetField(GetRecord(WonGetAuthInfo(),0),0);
            if ( TP_PrePendFlagBtn.getValue()==0 )
               TP_PreviewTag.setValue( %playerName @ %ntag);
            else
               TP_PreviewTag.setValue(%ntag @ %playerName);

            TProfileHdr.appending = TP_AppendFlagBtn.getValue;

         case "getTribeProfile":
            %this.state = "done";
            GetProfileHdr(0,getFields(%status,2));
            TWBText.Clear();
            %isMember = getTribeMember(TProfileHdr.TribeName);
              %Tdesc = "<lmargin:10><just:left><Font:Univers Condensed:18><color:ADFFFA>Recruiting: <font:Univers Condensed:18>" @ 
                       (TProfileHdr.recruiting ? (%isMember ? "YES" : "YES     <a:requestlink\t" @ TProfileHdr.tribename @ ">Request Invite</a>") : "NO");
               %Tdesc = %Tdesc @ "<Font:Univers Condensed:18>" NL "<color:82BEB9><lmargin:30><Font:Univers:18>";
            TWBText.setText(%TDesc);
            TProfileHdr.Desc = %resultString;
            if(trim(TProfileHdr.tribegfx) !$= "")
               TeamPix.setBitmap(TProfileHdr.tribegfx);
            else
               TeamPix.setBitmap($TribeGfx);
            TWBTitle.name = TPRofileHdr.tribeName;
            TWBTitle.setValue(TProfileHdr.tribeName TAB TProfileHdr.tribeTag);
            TWBText.SetText(TWBText.getText() NL TProfileHdr.Desc);
            if(memberlist.rowCount()==0)
            {
               %this.needRefresh = 0;
               TL_ROSTER.setValue(1);
            }

         case "getTribeRoster":
			//error("GTRoster Rows: " @ getField(%resultString,0));
            %this.linecount--;
            %this.MList = "";
            %this.trid = 0;
            if(isObject(memberListGroup))
               memberListGroup.delete();
            if(getField(%resultString,0)>0)
                {
               %this.state = "tribeRoster";
                    %this.rosterRowcount = getField(%resultString,0);
                }
            else
            {
               %this.state="done";
               messageBoxOK("NOTICE","No Tribe Members Found.");
            }

         case "getTribeNews":
               TWBText.Clear();
               %this.articleLines = 0;
            if(GetTribeMember(TProfileHdr.tribeName))
            {
                  TWBText.SetText("<just:left><color:ADFFFA><lmargin:10><Font:Univers Condensed:18>" @ TProfileHdr.tribeName @ " Options:" @
                                    "<color:82BEB9>\n\n<lmargin:20><spush><color:ADFFCC><a:forumlink" TAB TProfileHdr.tribeName @ ">Tribal Forum</a><spop>\n" @
                                    "<spush><color:ADFFCC><a:joinPublicChat" TAB TProfileHdr.tribeName @ ">Tribal Chat: Public</a><spop>\n" @
                                 "<spush><color:ADFFCC><a:joinPrivateChat" TAB TProfileHdr.tribeName @ ">Tribal Chat: Private</a><spop>");
            }
            else
            {
                  TWBText.SetText("<just:left><color:ADFFFA><lmargin:10><Font:Univers Condensed:18>" @ TProfileHdr.tribeName @ " Options:\n\n" @
                                    "<spush><color:ADFFCC><a:joinPublicChat" TAB TProfileHdr.tribeName @ ">Enter " @ TProfileHdr.tribeName @ " Public Chat</a><spop>\n" );
            }

            %this.state = "done";

//          if(getField(%resultString,0)>0)
//          {
//             %this.state = "tribeNews";
//          }
//          else
//          {
//             %this.state="done";
//             messageBoxOK("NOTICE","No Tribe News.");
//          }

         case "getTribeInvites":
               if(getField(%resultString,0) > 0)
               {
                  %this.state = "tribeInvites";
                  %this.tiid = 0;
                  if(isObject(memberListGroup))
                     memberListGroup.delete();
               }
               else
               {
                  %this.NeedRefresh = 0;  
                  %this.state = "done";
               }
         case "cancelInvite":
            %this.state = "done";
            tl_invites.setValue(1);
         case "setTribeGfx":
            %this.state = "done";
            messageBoxOK("NOTICE",getField(%status,1));
            tl_profile.setValue(1);
         case "changeTribeTag":
            %this.state = "done";
            messageBoxOK("NOTICE","Tribe Tag has been updated.","WonUpdateCertificate();");
         case "requestInvite":
            %this.state = "done";
            messageBoxOK("NOTICE",getField(%status,1));
      }
   }
   else if (getSubStr(getField(%status,1),0,9) $= "ORA-04061")
   {
      %this.state = "error";
      MessageBoxOK("ERROR","There was an error processing your request, please wait a few moments and try again.");
   }
   else
   {
      %this.state = "done";
      messageBoxOK("WARNING",getField(%status,1));
   }
   canvas.setCursor(DefaultCursor);
}
//-----------------------------------------------------------------------------
function TribePane::onDatabaseRow(%this, %row, %isLastRow, %key)
{
  if ( %this.key != %key )
      return;
// echo("RECV: " @ %row);
   switch$(%this.state)
   {
      case "tribeRoster":
			%name = getField(%row, 0);
			%wid = getField(%row,3);
			%linkName = getLinkName(%row, 0);
			%adminLevel = getField(%row, 5);
			%title = getField(%row, 4);
			%date = getField(%row, 6);
			%editkick = getField(%row, 8);
			%onLine = getField(%row,9);

            if(%this.Admin $= "007")
               %this.Admin = %name;

            if(%name !$="")
            {
				MemberList.AddMember(%this.trid, %wid,%name,%adminLevel,%editkick,%row);
				MemberList.AddRow(%wid,%name TAB %title TAB %adminLevel TAB %this.trid);
				%this.trid++;
				//MemberList.setRowStylebyID( %wid, !%onLine );
            }
    
			if(%isLastRow)
			{
				%this.MList = %this.MList @ %name;
				MemberList.GetOnlineStatus();
				if(%this.needRefresh)
				{
					%this.needRefresh = 0;
					TL_ROSTER.setValue(1);
				}
			}
			else
				%this.MList = %this.MList @ %name @ ",";

			%this.linecount++;

      case "tribeNews":
            %this.articleID = getField(%row,0);
            %this.forumName = getField(%row,1);
            %authorQuad = getFields(%row,5,8);
            %this.articleAuthor = getLinkName(%authorQuad);
            %this.articleUpdate = getField(%row,9);
            %this.articleTitle = getField(%row,10);
              %text = "<lmargin:30><Font:Univers Condensed:18>" @ "<a:forumlink\t" @ %this.forumName @ "\t" @ %this.articleID @ "\t" @ %this.articleTitle @ "><spush><color:FFAA00>"
                      @ %this.articleTitle @ "</a><spop>"NL "<Font:Univers:12> submitted by " @ %this.articleAuthor SPC "on" SPC %this.articleUpdate @ "\n<Font:Univers:16>";
            %text = %text @ getFields(%row,11);
            TWBText.SetText(TWBText.GetText() @ %text @ "\n------------------------------------\n\n");

      case "tribeInvites":
            %inviteId = getField(%row,0);
            %inviteDate = getField(%row,1);
            %invitorQuad = getField(getfields(%row,2,5),0);
            %invitedQuad = getField(getFields(%row,6,9),0);
            %isOwned = getField(%row,10);
            %onLine = getField(%row,11);
            MemberList.AddInvite(%this.tiID, %inviteID,%invitedQuad,%invitorQuad,%isOwned,%row);
                MemberList.AddRow(%inviteID, getField(%invitedQuad,0) TAB %inviteDate TAB %this.tiID);
            %this.tiID++;
            MemberList.setRowStylebyID( %inviteId, !%onLine );
               if(%isLastRow)
                  MemberList.GetOnlineStatus();
   }
}
//-----------------------------------------------------------------------------
function TribePane::connectionTerminated(%this,%key)
{
   canvas.setCursor(DefaultCursor);
  if (%this.NeedRefresh==1)
  {
    %this.NeedRefresh = 0;
   TWBTitle.OldText = TWBTitle.name;
    TL_Roster.setValue(1);
  }
}
//-----------------------------------------------------------------------------
function TribePane::RosterDblClick(%this)
{
   LaunchBrowser( GetField(MemberList.getRowText(MemberList.getSelectedRow()),0), "Warrior" );
}
//-----------------------------------------------------------------------------
function TribePane::ButtonClick( %this, %senderid )
{
   canvas.SetCursor(ArrowWaitCursor);
   %this.tabstate = "TRIBE";
   %this.state = "status";
   %tribeName = TWBTabView.getSelectedText();

   if(isEventPending(TribeAndWarriorBrowserGui.eid))
      cancel(TribeAndWarriorBrowserGui.eid);

   switch(%senderid)
   {
      case 0: //PROFILE
         if(TWBTitle.OldText $= TWBTitle.name || MemberList.rowCount()==0)
            %this.NeedRefresh=0;  
         else
            %this.NeedRefresh=1;  

         %this.key = LaunchGui.key++;
         %this.state = "getTribeProfile";
         TWBTitle.OldText = TWBTitle.name;
         TribeAndWarriorBrowserGui.eid = schedule(500,0,DatabaseQuery,22,%tribeName,%this,%this.key);
      case 1: //ROSTER
         MemberList.Clear();
         MemberList.ClearColumns();
         MemberList.clearList();
         MemberList.CID = 0;
         %this.key = LaunchGui.key++;
         %this.state = "getTribeRoster";
         %this.tstate = "ROSTER";
         MemberList.addColumn( 0, "MEMBER", 92, 0, 100,"left");
         MemberList.addColumn( 1, "TITLE", 90, 0, 100,"left");
         MemberList.addColumn( 2, "RNK", 30, 0, 40, "numeric center" );
         TribeAndWarriorBrowserGui.eid = schedule(500, 0, DatabaseQueryArray,6,0,%tribeName,%this,%this.key, true);
      case 2: //NEWS BUTTON
         %this.key = LaunchGui.key++;
         %this.state = "getTribeNews";
         %this.tstate = "NEWS";
         TribeAndWarriorBrowserGui.eid = schedule(500, 0, DatabaseQueryArray,10,20,%tribeName,%this,%this.key,true);
      case 3: //INVITE BUTTON
         MemberList.Clear();
         MemberList.ClearColumns();
         MemberList.clearList();
         MemberList.CID = 1;
         %this.key = LaunchGui.key++;
         %this.state = "getTribeInvites";
         %this.tstate = "INVITES";
         MemberList.addColumn( 0, "PLAYER", 100, 0, 350,"left" );
         MemberList.addColumn( 1, "INVITED", 112, 0, 300, "left" );
         TribeAndWarriorBrowserGui.eid = schedule(500, 0, DatabaseQueryArray,11,0,%tribeName,%this,%this.key,true);
      case 4: //Admin Tribe
         if(trim(TWBText.getText()) !$= "")
         {
               TribePropertiesDlg.pendingChanges = "";
               Canvas.PushDialog(TribePropertiesDlg);
         }
         else
         {
            tl_profile.setvalue(1);
            MessageBoxOk("ERROR","The Tribe Profile was not properly loaded, please wait a moment and try again");
         }
   }
}
//-----------------------------------------------------------------------------
//==-- PlayerPane ------------------------------------------------------------
//-----------------------------------------------------------------------------
function PlayerPane::onAdd(%this)
{
   // Add the popup menu:
   new GuiControl(WarriorPopupDlg) {
      profile = "GuiModelessDialogProfile";
      horizSizing = "width";
      vertSizing = "height";
      position = "0 0";
      extent = "640 480";
      minExtent = "8 8";
      visible = "1";
      setFirstResponder = "0";
      modal = "1";

      new ShellPopupMenu( WarriorPopup ) {
         profile = "ShellPopupProfile";
         position = "0 0";
         extent = "0 0";
         minExtent = "0 0";
         visible = "1";
         maxPopupHeight = "200";
         noButtonStyle = "1";
      };
   };
}
//-----------------------------------------------------------------------------
function PlayerPane::onWake(%this)
{
   w_admin.setVisible(getField(getRecord(wonGetAuthInfo(),0),0) $= TProfileHdr.PlayerName);
   if(trim(TProfileHdr.playerGfx)$="")
      PlayerPix.setBitmap($PlayerGfx);
   else
      PlayerPix.setBitmap(TProfileHdr.playergfx);

   w_profile.setValue(1);

}
//-----------------------------------------------------------------------------
function PlayerPane::onDatabaseQueryResult(%this,%status,%resultString,%key)
{
   if(%this.key != %key)
      return;
// echo("RECV: " @ %status);
   if(getField(%status,0)==0)
   {
      switch$(%this.state)
      {
         case "getWarriorProfile":
               %isCaller = getField(getRecord(wonGetAuthInfo(),0),0) $= TWBTitle.name;
               TWBTitle.name = getField(%status,2);
               TWBTitle.SetValue(( getField(%status,4) ? getField(%status,2) @ getField(%status,3) : getField(%status,3) @ getField(%status,2)));
               GetProfileHdr(1,getFields(%status,2));
               if(trim(TProfileHdr.playerGfx) !$= "")
                  PlayerPix.setBitmap(TProfileHdr.playerGfx);
               else
                  PlayerPix.setBitmap($PlayerGfx);
               %profileText = "<just:left><lmargin:10><color:ADFFFA><Font:Univers Condensed:10> \n<Font:Univers Condensed:18>";
               %profileText = %profileText @ "Registered:<color:FFAA00>" SPC TProfileHdr.registered @ "<color:ADFFFA>\n";
//             %profileText = %profileText @ "Online:        " SPC (TProfileHdr.onLine ? "<color:33FF33>YES":"<color:FF3333>NO") @ "<color:ADFFFA>\n";

               if(trim(TProfileHdr.playerURL) !$= "")
                  %profileText = %profileText @ "WebSite:     " SPC "<spush><color:CCAA33><a:wwwlink\t" @ TProfileHdr.playerURL @ ">"@TProfileHdr.playerURL@"</a><spop>\n\n";
               else
                  %profileText = %profileText @ "WebSite:     " SPC "<spush><color:CCAA33><a:wwwlink\twww.tribes2.com>www.tribes2.com</a><spop>\n\n";

               %profileText = %profileText @  "<color:82BEB9><Font:Univers:18><just:left><lmargin:20>";
               W_Text.setText(%profileText @ %resultString);
               TProfileHdr.Desc = %resultString;
               if( w_memberlist.rowCount() ==0 )
               {
                  %this.needRefresh = 0;
                  W_tribes.setValue(1);
               }
         case "getWarriorHistory":
               W_Text.setText("\n<lmargin:10><just:left><Font:Univers Condensed:18><color:ADFFFA>PLAYER HISTORY:\n\n<lmargin:20><Font:Univers:18>");
               W_Text.setText(W_Text.getText() @ "<color:82BEB9><lmargin:30><Font:Univers:18>");
               if(getField(%resultString,0)>0)
                  %this.state = "warriorHistory";
               else
                  %this.state = "done";
         case "getWarriorTribeList":
               %this.wtid = 0;
               if(isObject(w_memberListGroup))
                  w_memberListGroup.delete();

               if(getField(%resultString,0)>0)
                  %this.state = "warriorTribeList";
               else
                  %this.state = "done";
         case "getWarriorBuddyList":
               %this.blid = 0;
               if(isObject(w_memberListGroup))
                  w_memberListGroup.delete();

					if(getField(%resultString,0)>0)
						%this.state = "warriorBuddyList";
					else
						%this.state = "done";
			case "setNoPrimaryTribe":
						%this.state = "done";
						messageBoxOK("NOTICE","You are now a free agent, primary tribe settings have been cleared");
			case "setPrimaryTribe":
						%this.state = "done";
						messageBoxOK("NOTICE",getField(%resultString,0) SPC "has been flagged as your primary tribe.","WonUpdateCertificate();");
			case "removeBuddy":
						%this.state = "done";
						w_buddylist.setvalue(1);
			case "inviteWarrior":
						%this.state = "done";
						MessageBoxOK("NOTICE",getField(%status,1));
			case "acceptInvite":
						%this.state = "done";
						EMailMessageDelete();
						MessageBoxOK("NOTICE","Your Invite Acceptance has been sent","WonUpdateCertificate();");
			case "rejectInvite":
						%this.state = "done";
						EMailMessagedelete();
						MessageBoxOK("NOTICE","Your Invite Rejection has been sent","CheckEmail();");
			case "leaveTribe":
						%this.state = "done";
						WonUpdateCertificate();
						for(%x=0;%x<TWBTabView.tabCount();%x++)
						{
							if(TWBTabView.getTabText(%x) $= %this.leavingTribe)
								twbTabView.removeTabByIndex(%x);
						}
						w_tribes.setValue(1);
			case "getVisitorOptions":
					%isCaller = getField(getRecord(wonGetAuthInfo(),0),0) $= TWBTitle.name;
					%callerTribes = getField(%status,9);
					%callerTribeList = getFields(%status,10);
					if(!%isCaller)
					{
						%newText = "<Font:Univers Condensed:18><color:ADFFFA>OPTIONS:<lmargin:20><Font:Univers:18>\n\n";
						%newText = %newText @ "<a:email" TAB TWBTitle.name @ ">Contact " @ TWBTitle.name @ "</a>\n";
						%newText = %newText @ "<a:addBuddy" TAB TWBTitle.name @ ">Add to Buddylist</a>\n";
						if(%callerTribes > 0)
						{
							for(%z=0;%z<%callerTribes;%z++)
							{
								%jtribe = getField(%callerTribeList,4*%z);
								%newText = %newText @ "<a:invite" TAB TWBTitle.name TAB %jtribe @ ">Invite " @ TWBTitle.name @ " to join " @ %jtribe @ "</a>\n";
							}
						}
						else
						{
							if(getField(getRecord(wonGetAuthInfo(),1),0)>0)
							{
								for(%z=0;%z<getField(getRecord(wonGetAuthInfo(),1),0);%z++)
								{
									%jtribe = getField(getRecord(wonGetAuthInfo(),2+%z),0);
									%newText = %newText @ "<a:invite" TAB TWBTitle.name TAB %jtribe @ ">Invite " @ TWBTitle.name @ " to join " @ %jtribe @ "</a>\n";
								}
							}
						}
					}
					else
					{
						%newText = "<Font:Univers Condensed:18><color:ADFFFA>OPTIONS:<lmargin:20><Font:Univers:18>\n\n";
						%newText = %newText @ "<a:editwarrior" TAB TWBTitle.name @ ">Edit Warrior Name</a>\n";
						%newText = %newText @ "<a:editdescription" TAB TWBTitle.name TAB "" @ ">Edit Description</a>\n";
					}
					W_Text.setText("<lmargin:10><just:left>" @ %newText @ "\n");
			case "setPlayerGfx":
				%this.state = "done";
				MessageBoxOK("CONFIRMED",getField(%status,1));
			case "setPlayerUrl":
				%this.state = "done";
				MessageBoxOK("CONFIRMED",getField(%status,1));
			case "changePlayerName":
				%this.state = "done";
            	IRCClient::quit();
            	if(WonUpdateCertificate())
				{
	               TProfileHdr.playername = NewNameEdit.getValue();
	               wp_currentname.setText(NewNameEdit.getValue());
	               twbTabView.setTabText(twbTabView.getSelectedId(),NewNameEdit.getValue());
	               MessageBoxOK("CONFIRMED","Warrior name has been changed." NL "This will require you to close and restart the game to ensure proper function","WarriorPropertiesDlg.onWake();");
	            }
         case "clearWarriorDescription":
            %this.state = "done";
            MessageBoxOK("CONFIRMED","Warrior Description Cleared");
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
      MessageBoxOK("WARNING",getField(%status,1));
   }
   canvas.setCursor(DefaultCursor);
}
//-----------------------------------------------------------------------------
function PlayerPane::onDatabaseRow(%this,%row,%isLastRow,%key)
{
   if(%this.key != %key)
      return;
// echo("RECV: " @ %row);
   switch$(%this.state)
   {
      case "warriorHistory":
            W_Text.setText(W_Text.getText() @ %row @ "\n");
            if(%isLastRow)
            {
               %this.state = "done";
               if( %this.needRefresh )
               {
                  %this.needRefresh = 0;
                  W_tribes.setValue(1);
               }
            }
      case "warriorTribeList":
            %wid = getField(%row,2);
            %name = getField(%row,0);
            %title = getField(%row,5);
            %adminLevel = getField(%row,3);
            %editkick = getField(%row,4);
            W_MemberList.AddMember(%this.wtid, %wid,%name,%adminLevel,%editkick,%row);
               W_MemberList.AddRow(%wid,%name TAB %title TAB %adminLevel TAB %this.wtid);
            %this.wtid++;

      case "warriorBuddyList":
            W_MemberList.AddInvite(%this.blid, getField(%row,3),getFields(%row,0,3),getFields(%row,0,3),4,%row);
                W_MemberList.AddRow(getField(%row,3),getField(%row,0) TAB getField(%row,4) TAB %this.blid);
            %this.blid++;
            if(%isLastRow)
              W_MemberList.getOnlineStatus();
//          W_MemberList.setRowStyleByID(getField(%row,3),!getField(%row,5));
   }
}
//-----------------------------------------------------------------------------
function PlayerPane::DblClick(%this)
{
   
   if(w_buddylist.getValue()==1 && getField(GetRecord(wonGetAuthInfo(),0),0) $= TWBTabView.getTabText(TWBTabView.GetSelectedID()))
      %caller = "Warrior";
   else if (w_tribes.getValue()==1)
      %caller = "Tribe";
   else
      %caller = "";
   if(trim(%caller) !$="")
      LaunchBrowser( GetField(W_MemberList.getRowText(W_MemberList.getSelectedRow()),0), %caller);
}
//-----------------------------------------------------------------------------
function PlayerPane::ButtonClick( %this, %senderid )
{  
   canvas.SetCursor(ArrowWaitCursor);
   %this.key = LaunchGui.key++;
   %this.tabstate = "WARRIOR";
   if(isEventPending(TribeAndWarriorBrowserGui.eid))
      cancel(TribeAndWarriorBrowserGui.eid);
   switch(%senderid)
    {
      case 0:  //Player Profile w/ Description
         W_Text.setValue("");
           %this.state = "getWarriorProfile";
          %this.qrystatus = 0;
         %owner = getField(getRecord(WonGetAuthInfo(),0),0);
           %playerName = TWBTabView.getTabText(TWBTabView.GetSelectedID());
          if(TWBTitle.OldText $= TWBTitle.name || w_memberlist.rowCount()==0)
            %this.NeedRefresh=0;  
           else
             %this.NeedRefresh=1;  

         TWBTitle.OldText = TWBTitle.name;
           if (%owner $= %PlayerName)
              %callId = 2;
         else
            %callId = 1;

         TribeAndWarriorBrowserGui.eid = schedule(500,0,DatabaseQuery,23,%playerName,%this,%this.key);
        case 1:   //Player History
          W_Text.setValue("");
         %this.state = "getWarriorHistory";
           %this.qrystatus = 1;
          %playerName = TWBTabView.getTabText(TWBTabView.GetSelectedID());
         %callId = 3;
           TribeAndWarriorBrowserGui.eid = schedule(500,0,DatabaseQueryArray,12,0,%playerName,%this,%this.key,true);
    	 case 2:	//TribeList
	        W_MemberList.Clear();
    	    W_MemberList.ClearColumns();
        	W_MemberList.clearList();
	        W_MemberList.CID = 0;
			%this.wtid = 0;
    	    %this.state = "getWarriorTribeList";
        	W_MemberList.addColumn( 0, "TRIBE", 94, 0, 330 );
	        W_MemberList.addColumn( 1, "TITLE", 80, 0, 300 );
    	    W_MemberList.addColumn( 2, "RNK", 38, 0, 50, "numeric center" );
        	%playerName = TWBTabView.getTabText(TWBTabView.GetSelectedID());
			if(%playerName $= getField(getRecord(wonGetAuthInfo(),0),0))
			{
				%ai = wonGetAuthInfo();
				for(%ix=0;%ix<getField(getRecord(%ai,1),0);%ix++)
				{
					%row = getRecord(%ai,2+%ix);
					//error("AIROW :" @ %row);
					%wid = getField(%row,3);
					%name = getField(%row,0);
					%title = getField(%row,5);
					if(%title $= "")
						%title = "Not Shown";
					%adminLevel = getField(%row,4);
					%editkick = %adminLevel >= 2;
					W_MemberList.AddMember(%this.wtid, %wid,%name,%adminLevel,%editkick,%row);
		   			W_MemberList.AddRow(%wid,%name TAB %title TAB %adminLevel TAB %this.wtid);
					%this.wtid++;
				}
			}
			else
		        TribeAndWarriorBrowserGui.eid = schedule(500,0,DatabaseQueryArray,13,0,%playerName,%this,%this.key,true);
	     case 3:	//Player Buddylist
    	    W_MemberList.Clear();
        	W_MemberList.ClearColumns();
	        W_MemberList.clearList();
    	    W_MemberList.CID = 1;
        	W_MemberList.addColumn( 0, "BUDDY", 100, 0, 250 );
	        W_MemberList.addColumn( 1, "SINCE", 112, 0, 250 );
    	    %this.key = LaunchGui.key++;
        	%this.state = "getWarriorBuddyList";
	        %playerName = TWBTabView.getTabText(TWBTabView.GetSelectedID());
    	    TribeAndWarriorBrowserGui.eid = schedule(500,0,DatabaseQueryArray,5,0,%playerName,%this,%this.key,true);
		case 4:	//Visitor Options
        	W_Text.setValue("");
	        %this.state = "getVisitorOptions";
    	    %owner = getField(getRecord(WonGetAuthInfo(),0),0);
        	%playerName = TWBTabView.getTabText(TWBTabView.GetSelectedID());
	        TWBTitle.OldText = TWBTitle.name;
    	    TribeAndWarriorBrowserGui.eid = schedule(500,0,DatabaseQuery,23,%playerName,%this,%this.key,true);
		case 5: //Admin Options
			if(trim(w_text.getText()) !$= "")
			{
        	 	WarriorPropertiesDlg.pendingChanges = "";
		         Canvas.PushDialog(WarriorPropertiesDlg);
			}
			else
			{
				w_profile.setValue(1);
				messageBoxOK("ERROR","Your Profile was not loaded properly, Please wait a moment and try again");
			}
  }
}
//-----------------------------------------------------------------------------
function W_MemberList::ClearList()
{
   if(isObject(W_MemberListGroup))
      W_MemberListGroup.Delete();
}
//-----------------------------------------------------------------------------
function W_MemberList::AddMember(%this,%mid, %id, %name, %access, %plevel, %vline)
{
   if(!isObject(W_MemberListGroup))
      new SimGroup(W_MemberListGroup);
   %player = new scriptObject()
   {
      className = "TMember";
     rowID = %mid;
      name = %name;
      classId = %id;
      privLevel = %access;
      canAdmin = %plevel;   
     rcvrec = %vline;
   };
   W_MemberListGroup.Add(%player);
}
//-----------------------------------------------------------------------------
function W_MemberList::AddInvite(%this, %rid, %id, %invited, %invitor, %plevel, %vline)
{
   if(!isObject(W_MemberListGroup))
      new SimGroup(W_MemberListGroup);
   %player = new ScriptObject() 
   {
      className = "TBuddy";
     rowID = %rid;
     classId = %id;
     name = %invited;
     privLevel = %plevel;
     iName = %invitor;
     rcvrec = %vline;
   };
   W_MemberListGroup.add(%player);
}
//-----------------------------------------------------------------------------
function W_MemberList::onRightMouseDown( %this, %column, %row, %mousePos )
{  
   // Open the action menu:
    W_MemberList.setSelectedRow(%row);
   if(getField(GetRecord(WonGetAuthInfo(),0),0) $= TWBTabView.getTabText(TWBTabView.GetSelectedID())) //is it me?
   {
      if(w_tribes.getValue())
         %ka = 3;
      else
         %ka = 2;
      warriorPopup.player = w_memberlistgroup.getObject(getField(W_MemberList.getRowText(W_MemberList.getSelectedRow()),%ka));
      if ( WarriorPopup.player.name !$= "" )
      {
         WarriorPopup.position = %mousePos;
         Canvas.pushDialog(WarriorPopupDlg);
        WarriorPopUpDlg.onWake();
        WarriorPopup.forceOnAction();
      }
      else
         error( "Member/Invite Locate Error!" );
   }
}
//-----------------------------------------------------------------------------
function w_MemberList::onAdd(%this)
{
   W_MemberList.addStyle( 1, "Univers", 12 , "150 150 150", "200 200 200", "60 60 60" );
}
//-----------------------------------------------------------------------------
function W_MemberList::GetOnlineStatus(%this)
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
function W_MemberList::onDatabaseQueryResult(%this,%status,%resultString,%key)
{
  if(%key != %this.key)
    return;
  switch$(%this.status)
  {
    case "getOnline": if(getField(%status,0) == 0)
                        for(%str=0;%str<strLen(%resultString);%str++)
                        {
                          %this.setRowStyle( %str, !getSubStr(%resultString,%str,1) );
                        }
  }
}
//==--------------------------------------------------------------------------
function WarriorPopupDlg::onWake( %this )
{
      TribeAndWarriorBrowserGui.WDialogOpen = true;
      warriorPopUP.clear();
    switch(W_MemberList.CID)
    {
      case 0:  if(getField(GetRecord(WonGetAuthInfo(),0),0) $= TWBTabView.getTabText(TWBTabView.GetSelectedID()))
            { // visitor is owner
               WarriorPopUp.add( strupr(WarriorPopup.Player.name), -1);
               WarriorPopUp.add( "---------------------------------------------", -1);
//                WarriorPopup.add( "Clear Primary Tribe setting", 0);              
               WarriorPopUp.add( "Make Primary Tribe", 1 );
               WarriorPopup.add( "Leave Tribe", 2 );
               WarriorPopup.add( "Go To Forum", 3 );
            }

      case 1: if(getField(GetRecord(WonGetAuthInfo(),0),0) $= TWBTabView.getTabText(TWBTabView.GetSelectedID()))
            { // visitor is owner
               WarriorPopUp.add( strupr(getField(WarriorPopup.player.name,0)), -1);
               WarriorPopUp.add( "---------------------------------------------", -1);
               WarriorPopup.add( "Contact By EMail", 4 );
               WarriorPopup.add( "Remove from Buddylist", 5 );
               WarriorPopup.add( ".............................................", -1);
               WarriorPopup.add( "Clear BuddyList", 6 );
               WarriorPopup.add( "EMail BuddyList", 7 );
            }

      case 2: WarriorPopup.Add("HMMM...",8);   
      case 3: WarriorPopup.Add("HMMM...",8);   
      default: WarriorPopup.Add("HMMM...",8);   
    }
  Canvas.rePaint();
}
//-----------------------------------------------------------------------------
function WarriorPopup::onSelect( %this, %id, %text )
{
   switch( %id )
   {
      case 0: //  0 Make No Primary Tribe
            %player = "NONE";
            LinkMakePrimary("setNoPrimaryTribe",%player,PlayerPane);
      case 1: //  1 Make Primary Tribe
            %player = getField(WarriorPopup.player.name,0);
            LinkMakePrimary("setPrimaryTribe",%player,PlayerPane);
      case 2: //  2 Leave Tribe
            %tribe = getField(WarriorPopup.player.name,0);
                  MessageBoxYesNo("CONFIRM", "Are you sure you wish to leave <spush><color:FFBB33>\n" @ %player @ "<spop>" @ %tribe @ "?",
                             "LinkLeaveTribe(\"" @ %tribe @ "\",\"" @ PlayerPane @ "\");","");
         case 3: //  3 Go To TribeForum
            %tribe = getField(WarriorPopup.player.name,0);
            switch$(%tribe)
            {
               case "T2 ADMINISTRATION":
                     %tribe = "Game Feedback";
            }
             ForumsThreadPane.setVisible(false);
             ForumsTopicsPane.setVisible(true);
            linkForum(%tribe,"");
      case 4: //  4 EMail Buddy
            %player = getField(WarriorPopup.player.name,0);
            LinkEMail(%player);
      case 5: //  5 Remove Buddy
            %player = getField(WarriorPopup.player.name,0);
            LinkRemoveBuddy(%player, PlayerPane, "removeBuddy");
      case 6: // clear Buddylist;
            LinkClearBuddylist(PlayerPane,"removeBuddy");
     case 7: //   7 EMail Buddylist
            for(%x=0;%x<w_memberlist.rowCount();%x++)
            {
               if(%x+1==w_memberlist.rowCount())                  
                  %mailList = %mailList @ getfield(w_memberList.getRowText(%x),0);
               else
                  %mailList = %mailList @ getfield(w_memberList.getRowText(%x),0) @ ",";
            }
           LinkEMail(%mailList);
     case 8:
     case 9:
     case 10:
     case 11:
     case 12:
   }
   canvas.PopDialog(WarriorPopupDlg);
}
//-----------------------------------------------------------------------------
function WarriorPopupDlg::onSleep(%this)
{
      TribeAndWarriorBrowserGui.WDialogOpen = false;
}
//-----------------------------------------------------------------------------
function MemberList::ClearList(%this)
{
   if(isObject(MemberListGroup))
      MemberListGroup.Delete();
}
//-----------------------------------------------------------------------------
function MemberList::AddMember(%this,%rid, %id, %name, %access, %plevel, %vline)
{
   if(!isObject(MemberListGroup))
       new SimGroup(MemberListGroup);
   %player = new scriptObject()
   {
      className = "TMember";
     rowID = %rid;
      name = %name;
      classId = %id;
      privLevel = %access;
      canAdmin = %plevel;   
     rcvrec = %vline;
   };
   MemberListGroup.Add(%player);
}
//-----------------------------------------------------------------------------
function MemberList::AddInvite(%this, %rid, %id, %invited, %invitor, %plevel, %vline)
{
   if(!isObject(MemberListGroup))
       new SimGroup(MemberListGroup);
   %player = new ScriptObject() 
   {
      className = "TInvited";
     rowID = %rid;
     classId = %id;
     name = %invited;
     iName = %invitor;
     privLevel = %plevel;
     rcvrec = %vline;
   };
   MemberListGroup.add(%player);
}
//-----------------------------------------------------------------------------
function MemberList::onRightMouseDown( %this, %column, %row, %mousePos )
{  
    MemberList.setSelectedRow(%row);
   if(tl_roster.getValue())
      %ka = 3;
   else
      %ka = 2;

   TribeMemberPopup.player = MemberListGroup.getObject(getField(MemberList.getRowText(MemberList.getSelectedRow()),%ka));
   if ( TribeMemberPopup.player.name !$= "")
   {
      TribeMemberPopup.position = %mousePos;
      Canvas.pushDialog(TribeMemberPopupDlg);
     TribeMemberPopupDlg.onWake();
     TribeMemberPopup.forceOnAction();
   }
   else
      error( "Member/Invite Locate Error!" );
}
//-----------------------------------------------------------------------------
function Memberlist::onAdd(%this)
{
    MemberList.addStyle( 1, "Univers", 12 , "150 150 150", "200 200 200", "60 60 60" );
}
//-----------------------------------------------------------------------------
function MemberList::GetOnlineStatus(%this)
{
    MemberList.key = LaunchGui.key++;
    MemberList.status = "getOnline";
    for(%oStat=0;%oStat<%this.RowCount();%oStat++)
    {
      if(%oStat == 0)
        %roster = MemberList.getRowID(%oStat);
      else
        %roster = %roster TAB MemberList.getRowID(%oStat);
    }
    databaseQuery(69,%roster, MemberList,MemberList.key);
}
//-----------------------------------------------------------------------------
function MemberList::onDatabaseQueryResult(%this,%status,%resultString,%key)
{
  if(%key != %this.key)
    return;
  switch$(%this.status)
  {
    case "getOnline": if(getField(%status,0) == 0)
                        for(%str=0;%str<strLen(%resultString);%str++)
                        {
                          MemberList.setRowStyle( %str, !getSubStr(%resultString,%str,1) );
                        }
  }
}
//-----------------------------------------------------------------------------
function TribeMemberPopupDlg::onWake( %this )
{
   TribeWarriorBrowserGui.TDialogOpen = true;
    TribeMemberPopup.clear();
   %isMember = 0;
   %ai = wongetauthinfo();
   for(%i=0;%i<getField(getRecord(%ai,1),0);%i++)
   {
      if(TProfileHdr.tribeName $= getField(getRecord(%ai,2+%i),0) || getField(getRecord(%ai,2+%i),3) == 1401 )
      {
         %isMember = 1;
         break;
      }
   }
   TribeMemberPopup.add( strUpr(TribeMemberPopup.player.name), -1);
   TribeMemberPopup.add( "--------------------------------------------",-1);
    switch(MemberList.CID)
    {
      case 0:  
             TribeMemberPopup.add( "Contact by EMail", 2 );
             TribeMemberPopup.add( "Add To Buddylist", 4 );
             TribeMemberPopup.add( "Add To Blocklist", 5 );
//          TribeMemberPopup.add( "Invite To Chat", 8);
            if(%isMember)
            {
               TribeMemberPopup.add( "............................................", -1);
               TribeMemberPopup.add( "Kick from Tribe", 0 );
               TribeMemberPopup.add( "Edit Profile", 1 );
               TribeMemberPopup.add( "EMail Tribe", 3 );
            }

      case 1: TribeMemberPopup.add( "Contact by EMail", 7 );
            TribeMemberPopup.add( "Add To Buddylist",4);
            TribeMemberPopup.add( "............................................", -1);
            TribeMemberPopup.add( "Cancel Invite", 6 );
      case 2: TribeMemberPopup.Add("HMMM...",8);   
      case 3: TribeMemberPopup.Add("HMMM...",8);   
      default: TribeMemberPopup.Add("HMMM...",8);   
    }
  Canvas.rePaint();      
}
//-----------------------------------------------------------------------------
function TribeMemberPopup::onSelect( %this, %id, %text )
{
   switch( %id )
   {
     //  -- 0-ROSTER ----
      case 0: //  0 Kick
           %player = TribeMemberPopup.player.name;
           %tribe = TWBTabView.GetTabText(TWBTabView.GetSelectedID());
            if(MemberList.rowCount()==1)
               TribePropertiesDlg.DisbandTribe(TribePropertiesDlg);
            else    
                  MessageBoxYesNo("CONFIRM", "Are you sure you wish to kick <spush><color:FFBB33>\n" @ %player @ "<spop> from <spush><color:FFBB33>" @ %tribe @ "<spop>?",
                                   "LinkKickMember(\"" @ %player @ "\",\"" @ %tribe @ "\"," @ %this @ ");", "");
      case 1: //  1 Admin Member
              LinkEditMember(GetField(TribememberPopup.player.rcvrec,0)
                        ,TWBTabView.GetTabText(TWBTabView.GetSelectedID())
                        ,GetField(TribeMemberPopup.player.rcvrec,5)
                        ,GetField(TribeMemberPopup.player.rcvrec,4)
                        ,TribeAdminMemberDlg);
      case 2: //  2 EMail Member
           LinkEMail(TribeMemberPopup.player.name);
      case 3: //  3 EMail Tribe
           LinkEMailTribe(MemberList.getSelectedID());
      case 4: //  4 Add To Buddylist
              MessageBoxYesNo("CONFIRM","Add " @ TribeMemberPopup.player.name @ " to Buddy List?",
                       "LinkAddBuddy(\"" @ TribeMemberPopup.player.name @ "\",TWBText,\"addBuddy\");","");
      case 5: //  5 Add To Blocklist
           MessageBoxYesNo("CONFIRM","Block Email from " @ TribeMemberPopup.player.name @ "?",
                       "LinkBlockPlayer(\"" @ TribeMemberPopup.player.name @ "\",EmailGui,\"setBlock\");","");
     //  -- 1-INVITE ----
     case 6: //   6 Cancel Invite
           %player = TribeMemberPopup.player.name;
           %tribe = TWBTabView.GetTabText(TWBTabView.GetSelectedID());
              MessageBoxYesNo("CONFIRM", "Are you sure you wish to cancel the invitation for " @ %player @ " to join " @ %tribe @ "?",
                             "TribeMemberPopup.onSelect(12,\"call12\");","");
     case 7: //   7 EMail Invited Player
           LinkEMail(TribeMemberPopup.player.name);
     case 8: //   8 INVITE TO CHAT
         MessageboxOK("NOTICE","This is a preview of coming functionality and is not yet available for use.");         
     case 9:
     case 10:
     case 11:
     case 12:  %player = TribeMemberPopup.player.name;
            %tribe = TWBTabView.GetTabText(TWBTabView.GetSelectedID());
            LinkInvitation("cancel",%tribe,%player,TribePane);
   }
   canvas.popDialog(TribeMemberPopupDlg);
}
//-----------------------------------------------------------------------------
function TribeMemberPopupDlg::onSleep(%this)
{
   TribeWarriorBrowserGui.TDialogOpen = false;
}
//-----------------------------------------------------------------------------
function TribePropertiesDlg::onWake(%this)
{
   if(TProfileHdr.recruiting)
      TP_RecruitFlagBtn.setValue(1);
   else
      TP_RecruitFlagNoBtn.setValue(1);

   if(TProfileHdr.appending)
      TP_AppendFlagBtn.setValue(1);
   else
      TP_PrePendFlagBtn.setValue(1);

   TP_CurrentTag.setText(TProfileHdr.TribeTag);
   TP_NewTag.setText(TProfileHdr.TribeTag);
   TP_TribeDescription.setText(TProfileHdr.Desc);

   %this.RefreshTag();
   %this.pendingChanges = "";
}
//-----------------------------------------------------------------------------
function TribePropertiesDlg::Close(%this)
{
   if(%this.pendingChanges $="")
   {
      Canvas.popDialog(%this);
      GraphicsControl.setVisible(0);
      SecurityControl.setVisible(0);
      ProfileControl.setVisible(1);
      TL_Profile.setValue(1);
   }
   else
      MessageBoxYesNo("CONFIRM","Close without saving changes?",
                  "Canvas.popDialog("@%this@");TL_Profile.setValue(1);","");
}
//-----------------------------------------------------------------------------
function TribePropertiesDlg::DisbandTribe(%this)
{
   MessageBoxYesNo("CONFIRM","NOTE: Only the Tribe Owner will be able to disband the Tribe." NL " " NL
               "DISBAND " @ TProfileHdr.tribename @ "?",
               "KillTribe(\"" @ TProfileHdr.tribename @ "\");","");
}
//-----------------------------------------------------------------------------
function TribePropertiesDlg::ChangeRecruiting(%this)
{
   if(TP_RecruitFlagBtn.getValue())
      %recruiting = 1;
   else
      %recruiting = 0;
   if(TProfileHdr.recruiting != %recruiting)
   {
      LinkTribeToggle("Recruiting",TProfileHdr.TribeName TAB TP_RecruitFlagBtn.getValue(),TWBText,"togglerecruiting");
      %this.pendingChanges="";
   }
}
//-----------------------------------------------------------------------------
function TribePropertiesDlg::ToggleAppending(%this)
{
   if(TProfileHdr.appending != TP_AppendFlagBtn.getValue())
   {
      LinkTribeToggle("Appending",TProfileHdr.TribeName TAB TP_AppendFlagBtn.getValue(),TWBText,"toggleappending");
      %this.pendingChanges="";
   }
}
//-----------------------------------------------------------------------------
function TribePropertiesDlg::ChangeTag(%this)
{
   if(TP_NewTag.getValue() !$= "")
   {
      TextCheck(TP_NewTag.getValue(),%this);
      if(%this.textCheck==1)
      {
         MessageBoxOK("WARNING","The requested Tribe Tag contains invalid characters, please change your tag and try again.");
      }
      else
      {
         TribePane.key = LaunchGui.key++;
         TribePane.state = "changeTribeTag";
         DatabaseQuery(30,TProfileHdr.tribeID TAB TP_NewTag.getValue(),TribePane,TribePane.key);
         %this.pendingChanges="";
      }
   }
   else
   {
      MessageBoxOK("WARNING","Tribe Tag cannot be blank","TP_NewTag.makeFirstResponder(1);");
   }
}
//-----------------------------------------------------------------------------
function TribePropertiesDlg::EditDescription(%this)
{
   %this.pendingChanges = "EDITDESC";
   %this.UpdateDescription();
}
//-----------------------------------------------------------------------------
function TribePropertiesDlg::ClearDescription(%this)
{
   TribePane.key = LaunchGui.key++;
   TP_TribeDescription.setText("");
   TProfileHdr.Desc = "";
   TWBText.editType = "tribe";
   canvas.SetCursor(ArrowWaitCursor);
   DatabaseQuery(15,TProfileHdr.tribename TAB getRecordCount(%desc) TAB %desc,TribePane,TribePane.key);
}
//-----------------------------------------------------------------------------
function TribePropertiesDlg::UpdateDescription(%this)
{
   TWBText.editType = "tribe";
   LinkEditWarriorDesc(TProfileHdr.tribename,TWBText);
}
//-----------------------------------------------------------------------------
function TribePropertiesDlg::RefreshTag(%this)
{
   %this.pendingChanges = "YES";
   %playerName = GetField( WonGetAuthInfo(), 0 );

   // Validate the tribe tag:
   %ntag = TP_NewTag.getValue();   
   %realTag = StripMLControlChars( %ntag );
   if ( %ntag !$= %realTag )
      TP_NewTag.setValue( %realTag );

   if ( TP_PrePendFlagBtn.getValue()==0 )
      TP_PreviewTag.setValue( %playerName @ %realTag );
   else
      TP_PreviewTag.setValue( %realTag @ %playerName );
}
//-----------------------------------------------------------------------------
function TribePropertiesDlg::LoadGfxPane(%this)
{
   TribeGraphic.setBitmap(TProfileHdr.tribeGfx);
   %ctrl = TribeGraphicsList;
   %fileSpec = "*.jpg";
   %ctrl.clearColumns();
   %ctrl.clear();
   %ctrl.addColumn( 0, "FILENAME", 100, 0, 200 );
   %id = -1;
   %rowId = "";
   for ( %file = findFirstFile( %fileSpec ); %file !$= ""; %file = findNextFile( %fileSpec ) )
   {
      %currBmp = TeamPix.Bitmap;
      %match = "texticons/twb/" @ fileBase( %file ) @ ".jpg" $= %currBmp;
      if(getSubStr(fileBase(%file) @ ".jpg",0,3)$= "twb")
            %ctrl.addRow( %id++, fileBase( %file ) );

      if(%match)
         %rowId = %id;
   }
   if(%rowID!$="")
      %ctrl.setSelectedRow(%rowID);
}
//-----------------------------------------------------------------------------
function TribePropertiesDlg::setTribeGraphic(%this)
{
   if(isEventPending(TribeAndWarriorBrowserGui.eid))
      cancel(TribeAndWarriorBrowserGui.eid);
   TribePane.key = LaunchGui.key++;
   TribePane.state = "setTribeGfx";
   TeamPix.setBitmap(TribeGraphic.bitmap);
    canvas.SetCursor(ArrowWaitCursor);
   TribeAndWarriorBrowserGui.eid = schedule(250,0,DatabaseQuery,29,TProfileHdr.tribename TAB TribeGraphic.bitmap,TribePane,TribePane.key);
}
//-----------------------------------------------------------------------------
function TribeGraphicsList::onSelect(%this)
{
   %jpg = "texticons/twb/" @ %this.getRowText(%this.getSelectedRow()) @ ".jpg";
   TribeGraphic.setBitmap(%jpg);
}
//-----------------------------------------------------------------------------
function TribePropertiesDlg::ConnectionTerminated(%this)
{
}
//-----------------------------------------------------------------------------
function WarriorPropertiesDlg::onWake(%this)
{
   %this.pendingChanges = "";
   UrlEdit.setValue(TProfileHdr.playerURL);
   WP_CurrentName.setValue(TProfileHdr.playername);
   NewNameEdit.setValue("");
   WP_WarriorDescription.setText(TProfileHdr.Desc);
   %this.LoadGfxPane();
}
//-----------------------------------------------------------------------------
function WarriorPropertiesDlg::Close(%this)
{
   if(%this.pendingChanges !$="")
      MessageBoxYesNo("CONFIRM","Close without saving changes?",
                  "Canvas.popDialog("@%this@");W_Profile.setValue(1);","");
   else
   {
      Canvas.popDialog(%this);
      w_GraphicsControl.setVisible(0);
      W_ProfilePane.setVisible(1);
      W_Profile.setValue(1);
   }
}
//-----------------------------------------------------------------------------
function WarriorPropertiesDlg::EditDescription(%this)
{
   %this.pendingChanges = "EDITDESC";
   TWBText.editType = "warrior";
   LinkEditWarriorDesc(getField(TWBTitle.getValue(),0),TWBText);
}
//-----------------------------------------------------------------------------
function WarriorPropertiesDlg::ClearDescription(%this)
{
   MessageBoxYesNo("CONFIRM","Clear your Players Description?","WarriorPropertiesDlg.doClearDescription();","");
}
//-----------------------------------------------------------------------------
function WarriorPropertiesDlg::doClearDescription(%this)
{
   PlayerPane.key = LaunchGui.key++;
   PlayerPane.state = "clearWarriorDescription";
   TProfileHdr.Desc = "NONE";
   TWBText.editType = "warrior";
    canvas.SetCursor(ArrowWaitCursor);
   %this.pendingChanges = "";
   EditDescriptionText.setText("No Description On File");
   WP_WarriorDescription.setText(EditDescriptionText.getText());
   DatabaseQuery(17,TProfileHdr.Desc,PlayerPane,PlayerPane.key);
}
//-----------------------------------------------------------------------------
function WarriorPropertiesDlg::LoadGfxPane(%this)
{
   PlayerGraphic.setBitmap(PlayerPix.bitmap);
   %ctrl = WarriorGraphicsList;
   %width = getSubStr(%ctrl.getExtent(),0,3)-4;
   %fileSpec = "*.jpg";
   %ctrl.clearColumns();
   %ctrl.clear();
   %ctrl.addColumn( 0, "FILENAME",%width, 0, 200 );
   %id = -1;
   %rowId = "";
   for ( %file = findFirstFile( %fileSpec ); %file !$= ""; %file = findNextFile( %fileSpec ) )
   {
      %currBmp = PlayerPix.Bitmap;
      %match = "texticons/twb/" @ fileBase( %file ) @ ".jpg" $= %currBmp;

      if(getSubStr(fileBase(%file) @ ".jpg",0,3)$= "twb")
            %ctrl.addRow( %id++, fileBase( %file ) );

      if(%match)
         %rowId = %id;
   }
   if(%rowID!$="")
      %ctrl.setSelectedRow(%rowID);
}
//-----------------------------------------------------------------------------
function WarriorPropertiesDlg::setPlayerGraphic(%this)
{
   if(isEventPending(TribeAndWarriorBrowserGui.eid))
      cancel(TribeAndWarriorBrowserGui.eid);
   PlayerPane.key = LaunchGui.key++;
   PlayerPane.state = "setPlayerGfx";
   PlayerPix.setBitmap(PlayerGraphic.bitmap);
    canvas.SetCursor(ArrowWaitCursor);
   %this.pendingChanges = "";
   TribeAndWarriorBrowserGui.eid = schedule(250,0,DatabaseQuery,31,PlayerGraphic.bitmap,PlayerPane,PlayerPane.key);
}
//-----------------------------------------------------------------------------
function WarriorPropertiesDlg::UpdateUrl(%this)
{
   if(trim(UrlEdit.getValue()) $= "")
   {
      UrlEdit.setValue("www.tribes2.com");
      MessageBoxYesNo("CONFIRM","Your URL is blank, by default www.tribes2.com will become your URL.  Continue?","WarriorPropertiesDlg.setURL();","UrlEdit.setValue(\"\");");
   }
   else
      WarriorPropertiesDlg.setURL();
   
}
//-----------------------------------------------------------------------------
function WarriorPropertiesDlg::setURL(%this)
{
      if(isEventPending(TribeAndWarriorBrowserGui.eid))
         cancel(TribeAndWarriorBrowserGui.eid);
      PlayerPane.key = LaunchGui.key++;
      PlayerPane.state = "setPlayerUrl";
       canvas.SetCursor(ArrowWaitCursor);
      %this.pendingChanges = "";
      DatabaseQuery(32,UrlEdit.getValue(),PlayerPane,PlayerPane.key);
}
//-----------------------------------------------------------------------------
function WarriorPropertiesDlg::ChangePlayerName(%this)
{  
   MessageBoxYesNo("CONFIRM","Changing your name will require you to close the game and restart.  Proceed?","WarriorPropertiesDlg.ProcessNameChange();","NewNameEdit.setValue(\"\");");
}
//-----------------------------------------------------------------------------
function WarriorPropertiesDlg::ProcessNameChange(%this)
{
   PlayerPane.key = LaunchGui.key++;
   PlayerPane.state = "changePlayerName";
    canvas.SetCursor(ArrowWaitCursor);
   %this.pendingChanges = "";
   DatabaseQuery(33,NewNameEdit.getValue(),PlayerPane,PlayerPane.key);
}
//-----------------------------------------------------------------------------
function WarriorGraphicsList::onSelect(%this)
{
   %jpg = "texticons/twb/" @ %this.getRowText(%this.getSelectedRow()) @ ".jpg";
   PlayerGraphic.setBitmap(%jpg);
}
//-----------------------------------------------------------------------------
function WarriorPropertiesDlg::ConnectionTerminated(%this)
{
}
//-----------------------------------------------------------------------------

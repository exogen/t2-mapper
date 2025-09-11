//------------------------------------------
// Forums code
//------------------------------------------
$ForumCacheVersion = 9; //lucky seven...NOT!
$ForumCachePath = "webcache/" @ getField(wonGetAuthInfo(),3) @ "/";
$currentForumPage = 0;
$topicPageLength = 60;

$ForumsConnecting = "CONNECTING";
$ForumsGetForums = "FETCHING FORUM LIST ";
$ForumsGetTopics = "FETCHING TOPICS ";
$ForumsTitle = "FORUMS";
$ForumsGetPosts = "FETCHING POSTS ";

$TopicColumnCount    = 0;
$TopicColumnName[0]  = "Topic";
$TopicColumnRange[0] = "50 1000";
$TopicColumnCount++;
$TopicColumnName[1]  = "Posts";
$TopicColumnRange[1] = "25 100";
$TopicColumnFlags[1] = "numeric center";
$TopicColumnCount++;
$TopicColumnName[2]  = "Last Poster";
$TopicColumnRange[2] = "50 500";
$TopicColumnCount++;
$TopicColumnName[3]  = "Last Post Date";
$TopicColumnRange[3] = "50 300";
$TopicColumnCount++;

$ForumColumnCount = 0;
$ForumColumnName[0]  = "Message Tree";
$ForumColumnRange[0] = "50 800";
$ForumColumnCount++;
$ForumColumnName[1]  = "Posted By";
$ForumColumnRange[1] = "50 500";
$ForumColumnCount++;
$ForumColumnName[2]  = "Date Posted";
$ForumColumnRange[2] = "50 500";
$ForumColumnCount++;

$GuidTribes = 0;

// format of a forum post is:
// Post ID
// Parent Post ID
// subject
// Author
// Post date
// Text lines

//Forums message vector post:
// postId
// parentId
// Topic
// Poster
// Date
// Message Line0
// MessageLine 1
// MessageLine 2

// Update is defined as:
// PostId
// UpdateId
// parentId
// poster
// Date
// topic
// body lines

if(!isObject(ForumsMessageVector))
{
   new MessageVector(ForumsMessageVector);
}
//-----------------------------------------------------------------------------
function LaunchForums( %forum, %topic )
{
	ForumsGui.setVisible(false);
	ForumsGui.launchForum = %forum;
	ForumsGui.launchTopic = %topic;
	forumsList.clear();

   if(trim(ForumsGui.launchTopic) $= "")
   {
      ForumsThreadPane.setVisible(false);
       ForumsTopicsPane.setVisible(true);
   }
       
	LaunchTabView.viewTab( "FORUMS", ForumsGui, 0 );
}
//-----------------------------------------------------------------------------
function isModerator()
{
   if(!$GuidTribes)
   	$GuidTribes = getRecords(WonGetAuthInfo(),1);
   %result = 0;
   for(%checkID=0;%checkID<getField(getRecord($GuidTribes,0),0);%checkID++)
   {
       %vID = getField(getRecord($GuidTribes,1+%checkID),3);
       if(%vID == 11739 || %vID == 1401)
           %result = 1;
   }
   return %result;
}
//-----------------------------------------------------------------------------
function isT2Admin()
{
	if(!$GuidTribes)
		$GuidTribes = getRecords(wonGetAuthinfo(),1);
   %result = 0;
   for(%checkID=0;%checkID<getField(getRecord($GuidTribes,0),0);%checkID++)
   {
       %vID = getField(getRecord($GuidTribes,1+%checkID),3);
       if(%vID == 1401)
           %result = 1;
   }
   return %result;
}
//-----------------------------------------------------------------------------
function updateTopicPageBtn(%prev,%next)
{		
     FTPrevBtn.setVisible( 0 );  
     FTNextBtn.setVisible( 0 );
//   FTPrevBtn.setActive( %prev );
//   FTNextBtn.setActive( %next );
}
//-----------------------------------------------------------------------------
function updatePostBtn(%selectedID,%authorID)
{
//   %selectedID = ForumsList.getSelectedID();

   %vCanAdmin = 0;
   
   FO_RejectBtn.visible = 0;
   FO_EditBtn.visible = 0;
   FO_AcceptBtn.visible = 0;
   FO_RejectBtn.text = "DELETE";
   FO_EditBtn.text = "EDIT";
   FO_AcceptBtn.text = "ACCEPT";
   
   if(%selectedID == -1402)
      FO_RejectBtn.text = "REJECT";

   if(%authorID==getField(getRecord(wonGetAuthInfo(),0),3))
       %vCanAdmin = 1;

   if(%selectedID < 0)
   {
       %selectedID = -%selectedID;
       for(%checkID=0;%checkID<getField(getRecord($GuidTribes,0),0);%checkID++)
       {
           if(getField(getRecord($GuidTribes,1+%checkID),3) == 1401)
               %vCanAdmin = 1;
           else if(%selectedID == getField(getRecord($GuidTribes,1+%checkID),3) && getField(getRecord($GuidTribes,1+%checkID),4) > 1)
               %vCanAdmin = 1;
       }
       
       if(%selectedID == 1402)
           FO_AcceptBtn.setVisible(%vCanAdmin);
   }
   else
   {
       for(%checkID=0;%checkID<getField(getRecord($GuidTribes,0),0);%checkID++)
       {
           if(getField(getRecord($GuidTribes,1+%checkID),3) == 1401)
               %vCanAdmin = 1;
           else if(%selectedID == getField(getRecord($GuidTribes,1+%checkID),3) && getField(getRecord($GuidTribes,1+%checkID),4) > 1)
               %vCanAdmin = 1;
       }
   }
   
   FO_EditBtn.setVisible(%vCanAdmin);
   FO_RejectBtn.setVisible(%vCanAdmin);
   canvas.repaint();      
}
//-----------------------------------------------------------------------------
function DateStrCompare(%date1,%date2)
{   
   %d1 = getSubStr(%date1,0,2);
   %d2 = getSubStr(%date2,0,2);

   if(%d1 == %d2)
   {
       %d1 = getSubStr(%date1,3,2);
       %d2 = getSubStr(%date2,3,2);
       if(%d1 == %d2)
       {
           %d1 = getSubStr(%date1,6,4);
           %d2 = getSubStr(%date2,6,4);
           if(%d1 == %d2)
           {
               if(getSubStr(%date1,17,1)$="a")
                   %d1 = getSubStr(%date1,11,2)+12;
               else
                   %d1 = getSubStr(%date1,11,2);
                   
               if(getSubStr(%date2,17,1)$="a")
                   %d2 = getSubStr(%date2,11,2)+12;
               else
                   %d2 = getSubStr(%date2,11,2);
                   
               if(%d1 == %d2)
               {
                   %d1 = getSubStr(%date1,14,2);
                   %d2 = getSubStr(%date2,14,2);
                   if(%d1 >= %d2)
                       return true;
                   else
                       return false;                         
               }
               else if(%d1 > %d2)
                   return true;
               else
                   return false;               
           }
           else if(%d1 > %d2)
               return true;
           else
               return false;
       }
       else if(%d1 > %d2)
           return true;
       else
           return false;
   }
   else if (%d1 > %d2)
       return true;
   else
       return false;
}
//-----------------------------------------------------------------------------
function IsPostAuthor(%author)
{
//    %ai = wonGetAuthInfo();
//    %pid = getField(GetRecord(%ai,0),
//    for(%east=0;%east<getField(getRecord(%ai,1),0);%east++)
//    {
//        %wonTribe = getRecord(%ai,2+%east);
//        ForumsList.addRow(getField(%wonTribe,3)*-1,getField(%wonTribe,0) TAB getField(%wonTribe,4) TAB getField(%wonTribe,2));
//    }
}
//-----------------------------------------------------------------------------
function BackToTopics()
{
   CacheForumTopic();
	ForumsGui.eid = schedule(250,ForumsGui,ForumsGoTopics);
}
//-----------------------------------------------------------------------------
function CacheForumTopic()
{
	%allRead = true;
	%numLines = ForumsMessageVector.getNumLines();
	for ( %line = 0; %line < %numLines; %line++ )
	{
		%lineText = ForumsMessageVector.getLineText( %line );
		if ( getRecord( %lineText, 0 ) $= "0" )
			%allRead = false;
           
     	// Keep track of the latest date:
      	%lineDate = getRecord( %lineText, 5 );
      	if ( %latest $= "" || strcmp( %lineDate, %latest ) > 0 )
        	%latest = %lineDate;
	}
   if(!ForumsMessageList.highestUpdate)
       ForumsMessageList.highestUpdate = 0;

   %newGroup = TopicsListGroup.getObject(ForumsTopicsList.getSelectedRow());
   ForumsMessageList.lastID = %newGroup.updateid;
   %latest = GetField(ForumsTopicsList.getRowTextbyID(ForumsTopicsList.getSelectedID()),3);
	ForumsMessageVector.dump( $ForumCachePath @ "tpc" @ ForumsMessageVector.tid , ForumsMessageList.lastID TAB $ForumCacheVersion TAB %allRead TAB %latest);
}
//-----------------------------------------------------------------------------
function ForumsAcceptPost()
{
   %parentId = ForumsMessageList.getSelectedId();
   %text = ForumsMessageVector.getLineTextByTag(%parentId);
   %index = ForumsMessageVector.getLineIndexByTag( %parentId );
   %author = getRecord( %text, 4 );
   %dev = getLinkName(%author);
   %date = getRecord(%text, 5);
   %body = getRecords(%text, 7);
   ForumsGui.ebstat = FO_EditBtn.Visible;
   ForumsGui.destat = FO_DeleteBtn.Visible;
   $NewsTitle = getRecord(%text, 3);
   ForumsMessageList.state = "newsAccept";
   Canvas.pushDialog(NewsPostDlg);
   NewsPostBodyText.setValue("submitted by " @ %dev @ "\n\n" @ ForumsGetTextDisplay(%body));
   NewsPostDlg.postID = -1;
   NewsPostDlg.action = "News";
   NewsPostDlg.Findex = %index;
   NewsPostDlg.FromForums = true;
}
//-----------------------------------------------------------------------------
function ForumsEditPost()
{
   ForumsGui.ebstat = FO_EditBtn.Visible;
   ForumsGui.destat = FO_DeleteBtn.Visible;
   %text = ForumsMessageVector.getLineTextByTag(ForumsComposeDlg.parentPost);
   $ForumsSubject = getRecord(%text, 3);
   Canvas.pushDialog(ForumsComposeDlg);
   ForumsBodyText.setValue(ForumsGetTextDisplay(%text,7));
   ForumsComposeDlg.post = ForumsComposeDlg.parentPost;
   ForumsComposeDlg.action = "Edit";
}
//-----------------------------------------------------------------------------
function ForumsGetTextDisplay(%text, %offSet)
{
   %msgText = "";
   %rc = getRecordCount(%text);

   for(%i = %offSet; %i < %rc; %i++)
      %msgText = %msgText @ getRecord(%text, %i) @ "\n";
   return %msgText;
}
//-----------------------------------------------------------------------------
function ForumsGoTopics(%direction)
{
   ForumShell.setTitle($ForumsConnecting);
   ForumsThreadPane.setVisible(false);
   ForumsTopicsPane.setVisible(true);
   FO_RejectBtn.visible = false;
   FO_EditBtn.visible = false;
   FO_AcceptBtn.visible = false;
   
   if ( ForumsTopicsList.rowCount() == 0 || ForumsTopicsList.refreshFlag )
   {
		FM_NewTopic.setActive(true);
		ForumShell.setTitle($ForumsConnecting);
		ForumsGui.eid = schedule(250,ForumsGui,GetTopicsList);
   }	
   else
	ForumsTopicsList.updateReadStatus();  //looks at file if any posts have been added/edited/deleted...
	ForumShell.setTitle("FORUMS: " @ getField(ForumsList.getRowTextbyID(ForumsList.getSelectedID()),0));
}
//-----------------------------------------------------------------------------
function ForumsRefreshTopics()
{
	ForumsTopicsList.refreshFlag = true;
   $currentForumPage = 0;
   updateTopicPageBtn(0,0);
	ForumsGui.eid = schedule(250,ForumsGui,GetTopicsList);
}
//-----------------------------------------------------------------------------
function ForumsMessageAddRow(%text)
{
   %rc = ForumsMessageList.rowCount();
   %isRead = getRecord( %text, 0 );
   %id = getRecord(%text, 1);
   %parentId = getRecord(%text, 2);
   %subject = getRecord(%text, 3);
   %author = getField(getTextName(getRecord(%text, 4), 0), 0);
   %authorName = getField(getRecord(%text,4),0);
   %date = getRecord(%text, 5);
   %ref = getRecord(%text, 6);
   %oldRow = ForumsMessageList.getRowNumById(%id);
   %selId = ForumsMessageList.getSelectedId();

	if(!%selID)
	{
		%selID = ForumsGui.lastSelected;
		ForumsGui.lastSelected = "";
	}
   
   if(%parentId)
   {
      for(%i = 0; %i < %rc; %i++)
      {
		// check for existing?
         if(ForumsMessageList.getRowId(%i) == %parentId)
         {
            %parentRow = ForumsMessageList.getRowText(%i);
//            echo("Found parent");
            break;
         }
      }
      %indentLevel = getField(%parentRow, 3) + 1;
      %indentSpace = "";
      for(%j = 0; %j < %indentLevel; %j++)
         %indentSpace = %indentSpace @ "    ";
   }
   else
      %indentSpace = "";
	
   %rowText = %indentSpace @ %subject TAB %author TAB %date TAB %indentLevel TAB %parentId TAB %ref TAB %authorName;

	if(%oldRow != -1) //if there's a rownumber - message exists
	{
    	ForumsMessageList.removeRow(%oldRow);
    	ForumsMessageList.addRow(%id, %rowText, %oldRow);
	}
	else if(!%parentId) //if a first post
	{
    	ForumsMessageList.addRow(%id, %rowText, 0);
	}
	else //continue from %i
	{
			for(%i++; %i < %rc; %i++)
			{
				%row = ForumsMessageList.getRowText(%i);
         		while(%row !$= "")
				{
            		%rowParent = getField(%row, 4);
            		if(%rowParent == %parentId)
               		break;

           	 		%row = ForumsMessageList.getRowTextById(%rowParent);
                  if(%rowParent == %row)
                     break;
				}
         		if(%row $= "")
            	break;
			}
			if(%i <= %rc)
           {
       			ForumsMessageList.addRow(%id, %rowText, %i);
           }
			else
           {
   		    	ForumsMessageList.addRow(%id, %rowText);
           }
	}
   ForumsMessageList.setRowStyleById( %id, !%isRead );

}
//-----------------------------------------------------------------------------
function ForumsNewTopic()
{
	%fid = ForumsList.getSelectedID();
	if( %fid == 105 || %fid == 35500 || %fid == 35501 || %fid == 35503 ||%fid == 35504)
	{
		messageBoxYesNo("CONFIRM",
						"Please do not submit bug reports without a tested solution, test posts or recruiting posts." NL " " NL "Continue with your submittal?",
						"StartPostNews();");
	}
	else
	{	
		$ForumsSubject = "";
		Canvas.pushDialog( ForumsComposeDlg );
		ForumsBodyText.setValue( "" );
		ForumsComposeDlg.parentPost = 0;
		ForumsComposeDlg.action = "Post";       
	}
}
//-----------------------------------------------------------------------------
function ForumsNext()
{
   %Currow = ForumsMessageList.getSelectedRow();
   if( %Currow < ForumsMessageList.rowCount() )
      ForumsMessageList.setSelectedRow( %Currow + 1 );
}
//-----------------------------------------------------------------------------
function ForumsOpenThread(%tid)
{
	ForumsGui.eid = schedule(250,ForumsGui,GetTopicPosts);
}   
//-----------------------------------------------------------------------------
function ForumsPost()
{
   
   $ForumsSubject = FP_SubjectEdit.getValue();
   if ( trim($ForumsSubject) $= "" )
   {
      MessageBoxOK( "POST FAILED", "Your post cannot be accepted without text in the Subject line.",
         "FP_SubjectEdit.makeFirstResponder(1);");
      return;
   }

   // the subject text could be too long (OCI strips out non-ascii.  encoding method ensures normal chars still readable
   if(getExpandedStrlen($ForumsSubject) >= 80)
   {
      MessageBoxOK( "POST FAILED", "Subject text too long.  Extended/international characters count as two letters.",
         "FP_SubjectEdit.makeFirstResponder(1);");
      return;
   }

	TextCheck($ForumsSubject,ForumsGui);
	if(!ForumsGui.textCheck)
	{      
      ForumsTopicsList.refreshFlag = 1;
      if(ForumsComposeDlg.parentPost == 0) //this is a new topic request
      {
         if(ForumsComposeDlg.action $= "Post")
         {
           %ord = 12;
           %proxy = ForumsGui;
           %proxy.state = "newTopic";
   	    ForumsGui.LaunchTopic = $ForumsSubject;
           %fieldData = ForumsComposeDlg.forum TAB
						 ForumsComposeDlg.topic TAB 
						 ForumsComposeDlg.parentPost TAB
						 $ForumsSubject TAB
						 ForumsBodyText.getValue();
         }
         else if(ForumsComposeDlg.action $="News")
		  {
           %ord = 14;
		    %proxy.state = "postNews";
           %fieldData = ForumsComposeDlg.post TAB
						 $ForumsSubject TAB
						 ForumsBodyText.getValue();
         }
      }
      else if(ForumsComposeDlg.parentPost != 0)
      {
         if(ForumsComposeDlg.action $= "Reply")
         {
           %ord = 12;
           %proxy = ForumsMessageList;
		    %proxy.state = "replyPost";
           %fieldData = ForumsComposeDlg.forum TAB
						 ForumsComposeDlg.topic TAB 
						 ForumsComposeDlg.parentPost TAB
						 $ForumsSubject TAB
						 ForumsBodyText.getValue();
         }
	      else if(ForumsComposeDlg.action $="Edit")
         {
           %ord = 13;
           %proxy = ForumsMessageList;
			%proxy.state = "editPost";
           %fieldData = ForumsComposeDlg.parentPost TAB
      					 $ForumsSubject TAB
      					 ForumsBodyText.getValue();
         }
      }
      %proxy.key = LaunchGui.key++;
      canvas.SetCursor(ArrowWaitCursor);
      DatabaseQuery(%ord,%fieldData,%proxy, %proxy.key);
	   Canvas.popDialog(ForumsComposeDlg);
	}
	else
	{
		messageBoxOK("ERROR","Please remove any of the following characters contained in your subject line and resubmit" NL "" NL " : < > * ^ | ~ @ % & / \\ ` \"");
		FP_SubjectEdit.makeFirstResponder(1);
	}
}
//-----------------------------------------------------------------------------
function ForumsPrevious()
{
   %Currow = ForumsMessageList.getSelectedRow();
   if( %Currow > 0 )
      ForumsMessageList.setSelectedRow( %Currow - 1 );
}
//-----------------------------------------------------------------------------
function ForumsRejectPost() //forumsDeletePost()
{
   ForumsGui.ebstat = FO_EditBtn.Visible;
   ForumsGui.destat = FO_DeleteBtn.Visible;
   ForumsMessageList.key = LaunchGui.key++;
   ForumsMessageList.state = "deletePost";
   canvas.SetCursor(ArrowWaitCursor);
   MessageBoxYesNo("CONFIRM", "Are you sure you wish to remove the selected post?",
  	      "DatabaseQuery(14," @ ForumsComposeDlg.parentPost @ "," @ ForumsMessagelist @ "," @ ForumsMessagelist.key @ ");", "canvas.SetCursor(defaultCursor);");
}
//-----------------------------------------------------------------------------
function ForumsReply()
{
   %text = ForumsMessageVector.getLineTextByTag(ForumsComposeDlg.parentPost);
   ForumsGui.ebstat = FO_EditBtn.Visible;
   ForumsGui.destat = FO_DeleteBtn.Visible;
   $ForumsSubject = getRecord(%text, 3);
   Canvas.pushDialog(ForumsComposeDlg);
   ForumsBodyText.setValue("");   
   QuoteBtn.setVisible(ForumsMessageVector.getNumLines() > 0);
//      MessageBoxYesNo("QUOTE?","Include Topic Post Text?","GetQuotedText();","ForumsBodyText.setValue(\"\");");
      
   ForumsComposeDlg.action = "Reply";
}
//-----------------------------------------------------------------------------
function GetQuotedText()
{
   if(ForumsComposeDlg.parentPost == 0)
   {
       ForumsBodyText.setValue("");
//       ForumsBodyText.setValue("<spush><color:FFCCAA>ALL YOUR BASE ARE BELONG TO US<spop>\n\n");
       ForumsBodyText.MakeFirstResponder(1);
       ForumsBodyText.setCursorPosition(3600);
   }
   else
   {
      ForumsBodyText.setValue("<spush><color:FFCCAA>\"" @ trim(ForumsText.getText()) @ "\"<spop>\n\n");
       ForumsBodyText.MakeFirstResponder(1);
      ForumsBodyText.setCursorPosition(3600);
   }
//   ForumsBodyText.setCursorPosition(strLen(ForumsBodyTExt.getText())+5);
}
//-----------------------------------------------------------------------------
function GetForumsList()
{
	ForumsList.clear();
	ForumsGui.onWake();
}
//-----------------------------------------------------------------------------
function GetTopicsList()
{
	ForumShell.setTitle($ForumsGetTopics);
   canvas.SetCursor(ArrowWaitCursor);
	ForumsTopicsList.clear();
   ForumsTopicsList.clearList();
	ForumsTopicsList.refreshFlag = 0;
	ForumsGui.key = LaunchGui.key++;
   ForumsGui.state = "getTopicList";
	DatabaseQueryArray(8,$currentForumPage,ForumsList.getSelectedID(),ForumsGui,ForumsGui.key,true);
}
//-----------------------------------------------------------------------------
function GetTopicPosts()
{
   ForumsThreadPane.setVisible(true);
	ForumsTopicsPane.setVisible(false);
	ForumShell.setTitle($ForumsGetPosts);
   canvas.SetCursor(ArrowWaitCursor);
	ForumsGui.key = LaunchGui.key++;
	ForumsGui.state = "getPostList";
	ForumsText.setValue("");   
	FO_TopicText.setValue(strupr(getField(ForumsTopicsList.getRowTextByID(ForumsComposeDlg.Topic),0)));

   if(!ForumsComposeDlg.Topic)
       ForumsComposeDlg.topic = ForumsTopicsList.getSelectedID();

   ForumsMessageList.clearList();
   ForumsMessageList.loadCache(getField(ForumsList.getRowTextByID(ForumsList.getSelectedID()),1));
   
   if(ForumsMessageList.lastID == 0)
   {
       ForumsMessageVector.clear();
       ForumsMessageList.clear();
   }   
   DatabaseQueryArray(9,0,ForumsComposeDlg.Topic TAB ForumsMessageList.lastID,ForumsGui,ForumsGui.key,true);
}
//-----------------------------------------------------------------------------
//-- ForumsGui ---------------------------------------------------------------
//-----------------------------------------------------------------------------
function ForumsGui::onAdd( %this )
{
   %this.initialized = false;
	if($GuidTribes == 0)
	{
	   %ai = wonGetAuthInfo();
	   $GuidTribes = getRecords(%ai,1);
	}
}
//-----------------------------------------------------------------------------
function ForumsGui::onWake(%this)
{
   // First time only:
   if ( !%this.initialized )
   {
	   // Add the columns from the prefs:TopicsList
	   for ( %i = 0; %i < $TopicColumnCount; %i++ )
	   {
	      ForumsTopicsList.addColumn( %i,
	                       $TopicColumnName[%i],
	                       $pref::Topics::Column[%i],
	                       firstWord( $TopicColumnRange[%i] ),
	                       getWord( $TopicColumnRange[%i], 1 ),
	                       $TopicColumnFlags[%i] );
	   }
	   ForumsTopicsList.setSortColumn( $pref::Topics::SortColumnKey );
	   ForumsTopicsList.setSortIncreasing( $pref::Topics::SortInc );

	   // Add columns from the prefs:MessageList
	   for ( %i = 0; %i < $ForumColumnCount; %i++ )
	      ForumsMessageList.addColumn( %i,
	                       $ForumColumnName[%i],
	                       $pref::Forum::Column[%i],
	                    	firstWord( $ForumColumnRange[%i] ),
	                    	getWord( $ForumColumnRange[%i], 1 ) );
	   // We want no sorting done on this list -- leave them in the order that they are entered.


      FM_NewTopic.setActive(false);
      ForumsThreadPane.setVisible(false);
      ForumsTopicsPane.setVisible(true);
      ForumsMessageList.thread = "";
      ForumsMessageList.lastId = "";
	   // Both panes should have the same minimum extents...
	   %minExtent = FO_MessagePane.getMinExtent();
	   FO_Frame.frameMinExtent( 0, firstWord( %minExtent ), restWords( %minExtent ) );
	   FO_Frame.frameMinExtent( 1, firstWord( %minExtent ), restWords( %minExtent ) );
      %this.initialized = true;
   }
   Canvas.pushDialog(LaunchToolbarDlg);
   if ( ForumsList.rowCount() == 0)
   {
      ForumsGui.key = LaunchGui.key++;
      ForumShell.setTitle($ForumsConnecting);
      ForumsGui.state = "getForumList";
     canvas.SetCursor(ArrowWaitCursor);
     $currentForumPage = 0;
	  DatabaseQueryArray(7,100,"",ForumsGui,ForumsGui.key);
   }
	// Make these buttons inactive until a message is selected:
   FTPrevBtn.setActive(false);
   FTNextBtn.setActive(false);
	FO_ReplyBtn.setActive( false );
	FO_NextBtn.setActive( false );
	FO_PreviousBtn.setActive( false );
}
//-----------------------------------------------------------------------------
function ForumsGui::onSleep(%this)
{
   Canvas.popDialog(LaunchToolbarDlg);
   // Stop the scheduled refreshes:
   cancel( %this.messageRefresh );
}
//-----------------------------------------------------------------------------
function ForumsGui::setKey( %this, %key )
{
}
//-----------------------------------------------------------------------------
function ForumsGui::onClose( %this, %key )
{
}
//-----------------------------------------------------------------------------
function ForumsGui::onDatabaseQueryResult(%this,%status,%resultString,%key)
{
	if(%this.key != %key)
		return;
//	echo("RECV: " @ %status NL "RS:" @ %resultString);
	if(getField(%status,0)==0)
	{
		switch$(%this.state)
		{
			case "getForumList":
				if(getField(%resultString,0)>0)
				{
					%this.forumCount = -1;
					ForumShell.setTitle($ForumsGetForums @ ": " @ getField(%resultString,0));
					%this.state = "ForumList";
					ForumsList.clear();
				}
				else
				{
					%this.state = "done";
					MessageBoxOK("NO DATA","No Forums found");
				}
			case "getTopicList":
				if(getField(%resultString,0)>0)
				{
					%this.txid = 0;
					ForumShell.setTitle($ForumsGetTopics @ ": " @ getField(%resultString,0));
					%this.state = "TopicList";
                   %recordCount = getField(%resultString,0);
					if(%recordCount > $topicPageLength)
					{
						if($currentForumPage == 0)
							updateTopicPageBtn(0,1);
						else if($currentForumPage > 0)
							updateTopicPageBtn(1,1);
					}
					else
					{
						if($currentForumPage == 0)
							updateTopicPageBtn(0,0);
						else if($currentForumPage > 0)
							updateTopicPageBtn(1,0);
					}
                   
				}
				else
               {
					%this.state = "done";
                   ForumsTopicsList.updateReadStatus();
               }

			case "getPostList":
				%statFlag = getField(%status,2);
				%forumFlag = getField(ForumsList.getRowTextbyId(ForumsList.getSelectedID()),1);
               %forumID = getField(ForumsList.getRowTextById(ForumsList.getSelectedID()),2);
               %forumTID = ForumsTopicsList.getSelectedID();

	   			%this.bflag = %statFlag;
 
				if(getField(%resultString,0)>0)
				{
					ForumShell.setTitle($ForumsGetPosts @ ": " @ getField(%resultString,0));
					%this.state = "PostList";
					if(!ForumsGui.visible)
						ForumsGui.setVisible(true);
				}
				else
				{
					%this.state = "done";
                   ForumsMessageList.clearList();
					ForumsMessageList.loadCache(%forumID);
				}
			case "postNews":
				%this.state = "done";
				messageBoxOK("CONFIRMED","Your News Reply has been submitted");
           case "newTopic":
               %this.state = "done";
               ForumsRefreshTopics();
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
		MessageBoxOk("ERROR",getField(%status,1));
	}
	ForumShell.setTitle("FORUMS: " @ getField(ForumsList.getRowTextbyID(ForumsList.getSelectedID()),0));
   canvas.SetCursor(defaultCursor);
}
//-----------------------------------------------------------------------------
function ForumsGui::onDatabaseRow(%this,%row,%isLastRow,%key)
{
	if(%this.key != %key)
		return;
//	echo("RECV: " @ %row);
	%forumTID = getField(ForumsList.getRowTextbyId(ForumsList.getSelectedID()),2);
	switch$(%this.state)
	{
		case "ForumList":
			ForumsList.addRow(getField(%row,0),getField(%row,1) TAB getField(%row,2) TAB getField(%row,3));
			if ( %isLastRow ) //is last line
	   		{
               %ai = wonGetAuthInfo();
               for(%east=0;%east<getField(getRecord(%ai,1),0);%east++)
               {
                   %wonTribe = getRecord(%ai,2+%east);
                   ForumsList.addRow(getField(%wonTribe,3)*-1,getField(%wonTribe,0) TAB getField(%wonTribe,4) TAB getField(%wonTribe,2));
               }
	      		if ( ForumsGui.launchForum !$= "" )
	      		{
	         		ForumsList.selectForum( ForumsGui.LaunchForum );
			   		ForumsGui.LaunchForum = "";
				}
	      		else
	         		ForumsList.setSelectedRow( 1 );
			}
		case "TopicList":

			%id = getField(%row, 1);
      		%topic = getField(%row, 2);
      		%postCount = getField(%row, 3);
      		%date = getField(%row, 6);
      		%name = getField(%row, 8);
	   		%hasDeletes = getField(%row,12);
           %slevel = getField(%row,13);
           %maxUpdateId = getField(%row,14);
            ForumsTopicsList.addTopic( %this.txid, %id, %topic, %date, %maxUpdateID, %slevel, %row);
 			ForumsTopicsList.addRow( %id, %topic TAB %postCount TAB %name TAB %date TAB %hasDeletes TAB %this.txid);
		    %this.txid++;
 			if ( %isLastRow ) //is last line
 	   		{
 				%this.state = "done";
 				ForumShell.setTitle("FORUMS: " @ getField(ForumsList.getRowTextbyID(ForumsList.getSelectedID()),0));
//				ForumsTopicsList.sort();
				ForumsTopicsList.updateReadStatus();
      			%this.refreshFlag = false;
 				if ( ForumsGui.LaunchTopic !$= "" )
 				{
 					ForumsTopicsList.selectTopic( ForumsGui.LaunchTopic );
 					ForumsGui.LaunchTopic = "";
 				}
               else if( ForumsMessageVector.tid !$= "" )
                   ForumsTopicsList.setSelectedbyId(ForumsMessageVector.tid);
               else
                   ForumsTopicsList.setSelectedRow(0);
 			}
		case "PostList":
				%isAuthor = getField(%row,0);
         		%postId = getField(%row,2);
            	%parent = getField(%row,3);
         		%high = getField(%row,4);
            	%poster = getFields(%row,5,8);
            	%date = getField(%row,10);
               %isDeleted = getField(%row,12);
            	%topic = getField(%row,13);
            	%body = getFields(%row,14);
         		if ( %high > ForumsMessageList.highestUpdate )
            		ForumsMessageList.highestUpdate = %high;
            	if(%parent == %postId)
               		%parent = 0;

            	%text = 0 NL
                   		%postId NL
                   		%parent NL
                   		%topic NL
                   		%poster NL
                   		%date NL
					    %isAuthor NL
                   		%body;

            	%li = ForumsMessageVector.getLineIndexByTag(%postId);
            	if(%li != -1)
               		ForumsMessageVector.deleteLine(%li);

               if(ForumsMessageList.allRead && DateStrCompare(ForumsMessageList.lastDate,%date))
                   %text = setRecord( %text, 0, "1" );
                   
               if(!%isDeleted)
               	ForumsMessageVector.pushBackLine(%text, %postId);
                   
				if(%isLastRow)
				{
                   ForumsMessageVector.tid = ForumsTopicsList.getSelectedID();
	                ForumsTopicsList.thread = TopicsListGroup.getObject(ForumsTopicsList.getSelectedRow());
                   ForumsTopicsList.thread.updateID = %high;
				    CacheForumTopic();
					ForumsMessageList.loadCache(ForumsTopicsList.getSelectedID());
				}
	}
}
//-----------------------------------------------------------------------------
function ForumsGui::NextThreadPage()
{
   if($currentForumPage >= 5)
       return;
	ForumsGui.key = LaunchGui.key++;
	ForumShell.setTitle($ForumsGetTopics);
   ForumsGui.state = "getTopicList";
	ForumsTopicsList.clear();
   canvas.SetCursor(ArrowWaitCursor);
   ForumsTopicsList.clearList();
   $currentForumPage++;
	DatabaseQueryArray(8,$currentForumPage,ForumsList.getSelectedID(),ForumsGui,ForumsGui.key,true);
	ForumsTopicsList.refreshFlag = 0;
}
//-----------------------------------------------------------------------------
function ForumsGui::PreviousThreadPage()
{
   if($currentForumPage == 0)
       return;
	ForumsGui.key = LaunchGui.key++;
	ForumShell.setTitle($ForumsGetTopics);
   ForumsGui.state = "getTopicList";
	ForumsTopicsList.clear();
   canvas.SetCursor(ArrowWaitCursor);
   ForumsTopicsList.clearList();
   $currentForumPage--;
	DatabaseQueryArray(8,80,ForumsList.getSelectedID(),ForumsGui,ForumsGui.key,true);
	ForumsTopicsList.refreshFlag = 0;
}
//-----------------------------------------------------------------------------
//-- ForumsList --------------------------------------------------------------
//-----------------------------------------------------------------------------
function ForumsList::onSelect(%this)
{	
	if(isEventPending(ForumsGUI.eid))
		cancel(ForumsGui.eid);
	FM_NewTopic.setActive(true);
	ForumsComposeDlg.forum = ForumsList.getSelectedID();
	ForumShell.setTitle("FORUMS: " @ getField(ForumsList.getRowTextbyID(ForumsList.getSelectedID()),0));
   $currentForumPage = 0;
	ForumsGui.eid = schedule(250,ForumsGui,GetTopicsList);
}
//-----------------------------------------------------------------------------
function ForumsList::connectionTerminated( %this, %key )
{
	ForumShell.setTitle("FORUMS: " @ getField(ForumsList.getRowTextbyID(ForumsList.getSelectedID()),0));
   if ( %key != %this.key )
      return;
}
//-----------------------------------------------------------------------------
function ForumsList::selectForum( %this, %forum )
{
  %rowCount = %this.rowCount();
  for ( %row = 0; %row < %rowCount; %row++ )
  {
     if ( %forum $= getField( %this.getRowText( %row ), 0 ) )
     {
        %this.setSelectedRow( %row );
        break;
     }
  }
  if ( %row == %rowCount )
     warn( "\"" @ %forum @ "\" forum not found!" );
}
//-----------------------------------------------------------------------------
//-- ForumsTopicsList --------------------------------------------------------
//-----------------------------------------------------------------------------
function ForumsTopicsList::onAdd( %this )
{
   new GuiControl(TopicsPopupDlg) {
      profile = "GuiModelessDialogProfile";
      horizSizing = "width";
      vertSizing = "height";
      position = "0 0";
      extent = "640 480";
      minExtent = "8 8";
      visible = "1";
      setFirstResponder = "0";
      modal = "1";

      new ShellPopupMenu( TopicsPopupMenu ) {
         profile = "ShellPopupProfile";
         position = "0 0";
         extent = "0 0";
         minExtent = "0 0";
         visible = "1";
         maxPopupHeight = "200";
         noButtonStyle = "1";
      };
   };

   // Add the "Unread" style:
   %this.addStyle( 1, $ShellBoldFont, $ShellFontSize, "80 220 200", "30 255 225", "10 60 40" );
   // Add the "Ignored" style:
   %this.addStyle( 2, $ShellFont, $ShellFontSize, "100 100 100", "100 100 000", "100 100 100" );
   // Add the "LOCKED" style:
   %this.addStyle( 3, $ShellFont, $ShellFontSize, "200 50 50", "200 100 100", "200 50 50" );
}
//-----------------------------------------------------------------------------
function ForumsTopicsList::AddTopic(%this, %iRow, %id, %topicname, %date, %mid, %slevel, %vline)
{
   if(!isObject(TopicsListGroup))
       new SimGroup(TopicsListGroup);
   %topic = new scriptObject()
   {
      className = "TTopic";
	  rowID = %iRow;
      Id = %id;
      name = %topicname;
      date = %date;
      updateid = %mid;
      slevel = %slevel;
	  rcvrec = %vline;
   };
   TopicsListGroup.Add(%topic);
}
//-----------------------------------------------------------------------------
function ForumsTopicsList::ClearList()
{
	if(isObject(TopicsListGroup))
		TopicsListGroup.Delete();
}
//-----------------------------------------------------------------------------
function ForumsTopicsList::onRightMouseDown( %this, %column, %row, %mousePos )
{  
    ForumsTopicsList.setSelectedRow(%row);
//	for(%i=0;%i<ForumsTopicsList.rowCount();%i++)
//	{
//		ForumsTopicsList.
		TopicsPopupMenu.topic = TopicsListGroup.getObject(getField(ForumsTopicsList.getRowText(ForumsTopicsList.getSelectedRow()),5));
//	}
   if ( trim(TopicsPopupMenu.topic.name) !$= "")
   {
      Canvas.pushDialog(TopicsPopupDlg);
      TopicsPopupMenu.position = %mousePos;
	   TopicsPopupDlg.onWake();
	   TopicsPopupMenu.forceOnAction();
   }
   else
      error( "Locate Error!" );
}
//-----------------------------------------------------------------------------
function TopicsPopupDlg::onWake( %this )
{
	ForumsGui.TDialogOpen = true;
   TopicsPopupMenu.clear();

   TopicsPopupMenu.add( getSubstr(strupr(TopicsPopupMenu.topic.name),0,30) , -1);
   
   for (%i = 0; %i < strlen(TopicsPopupMenu.topic.name)*2 && %i < 30; %i++)
      %line = %line @ "-";
      
   TopicsPopupMenu.add(%line,-1);
   TopicsPopupMenu.add("Reset Cache", 0);
   TopicsPopupMenu.add("Flag Ignore", 1);   
   TopicsPopupMenu.add("Flag All Read", 2);   
	if(isModerator())
    {
		TopicsPopupMenu.add(%line,-1);
		TopicsPopupMenu.add("Request Admin Review", 3);   
	    if(isT2Admin())
	    {
			TopicsPopupMenu.add(%line,-1);
//			TopicsPopupMenu.add("Request Admin Review", 3);   
	        TopicsPopupMenu.add("Lock Topic", 4);   
	        TopicsPopupMenu.add("Unlock Topic", 5);   
		  	TopicsPopupMenu.add("Move Topic",6);
	        TopicsPopupMenu.add("Remove Topic", 10);   
	    }
	}
            
   Canvas.rePaint();      
}
//-----------------------------------------------------------------------------
function TopicsPopupMenu::onSelect( %this, %id, %text )
{
//   echo("TPM RECV: " @ %id TAB %text);
   switch( %id )
   {
      case 0: //	0 Reset Cache              
               ForumsMessageVector.clear();
               ForumsMessageVector.dump( $ForumCachePath @ "tpc" @ TopicsPopupMenu.topic.id , 0 TAB $ForumCacheVersion TAB 0 TAB "2000-12-31 12:01am");
               ForumsMessageVector.updateID = 0;
               ForumsTopicsList.UpdateReadStatus();
//               ForumsRefreshTopics();
      case 1: //	1 Flag TO IGNORE (ok, 45 years...)
               ForumsMessageVector.clear();
               ForumsMessageVector.dump( $ForumCachePath @ "tpc" @ TopicsPopupMenu.topic.id , 99999999 TAB $ForumCacheVersion TAB 1 TAB "2045-12-31 12:01am");
               ForumsMessageVector.updateID = 99999999;
               ForumsTopicsList.UpdateReadStatus();
//               ForumsRefreshTopics();
      case 2: //  2 Flag To ALL Read              
               ForumsMessageVector.updateID = 100;
               %cacheFile = $ForumCachePath @ "tpc" @ TopicsPopupMenu.topic.id;
               if(ForumsMessageVector.tid == TopicsPopupMenu.topic.id)
               {
                   new MessageVector(TempVector);
                   %numLines = ForumsMessageVector.getNumLines();
                   for(%x=0;%x<%numLines;%x++)
                   {
                       %lineText = ForumsMessageVector.getLineText( %x );
                       %postID = getRecord( %lineText, 1 );
                       %lineText = setRecord(%lineText,0,"1");
                       TempVector.pushBackLine(%lineText, %postID);                       
                   }
                   ForumsMessageVector.clear();
	                for ( %line = 0; %line < %numLines; %line++ )
                   {
                       %lineText = TempVector.getLineText( %line );
                       %postID = getRecord( %lineText, 1 );
                       ForumsMessageVector.pushBackLine( %lineText, %postID );
                   }
                   TempVector.delete();
                   TopicsPopupMenu.topic.updateId = 0;
                   CacheForumTopic();
                   ForumsTopicsList.UpdateReadStatus();
//                   ForumsRefreshTopics();
               }               
               else
               {               
                   ForumsMessageVector.clear();
                   ForumsMessageVector.tid = TopicsPopupMenu.topic.id;
                   %file = new FileObject();
                   if ( %file.openForRead( %cacheFile ) )
                   {
                      if ( !%file.isEOF() )
                      {
                         // First line is the update id:
                         %line = %file.readLine();
                         if ( getField( %line, 1 ) == $ForumCacheVersion )
                         {
                            if ( !%file.isEOF() )
                            {
                               // Second line is the message count:
                               %count = %file.readLine();

                               // Now push all of the messages into the message vector:
                                while ( !%file.isEOF() )
                                {
					                %line = %file.readLine();
                	                %postId = firstWord( %line );
                	                %text = collapseEscape( restWords( %line ) );
					                // RESET THE FIELDS IF THE POST IS BEING VISITED BY THE AUTHOR.
                                   %text = setRecord( %text, 0, "1" );                                   
                	                ForumsMessageVector.pushBackLine( %text, %postId );
                                }
                            }
                         }
                         else
                         {
                         }
                      }
                      else
                      {
                      }
                      %file.close();
                      TopicsPopupMenu.topic.updateId = 0;
                      CacheForumTopic();
                   }
                   else
                   {
                      ForumsMessageVector.clear();
                      %latest = GetField(ForumsTopicsList.getRowText(ForumsTopicsList.getSelectedRow()),3);
                      %newGroup = TopicsListGroup.getObject(ForumsTopicsList.getSelectedRow());
//                      ForumsMessageList.lastID = %newGroup.updateid;
                      ForumsMessageList.lastID = 0;
                      ForumsMessageVector.dump( %cacheFile , 0 TAB $ForumCacheVersion TAB 1 TAB %latest);
                   }
                   %file.delete();
                   ForumsTopicsList.UpdateReadStatus();
//                   ForumsRefreshTopics();
               }
       case 3: //Request Admin Review
               TopicsPopupDlg.key = LaunchGui.key++;
               TopicsPopupDlg.state = "requestReview";
               %fieldData = ForumsList.getSelectedID() TAB ForumsTopicsList.getSelectedID() TAB getField(TopicsPopupMenu.topic.rcvrec,11);
               databaseQuery(60, %fieldData, TopicsPopupDlg, TopicsPopupDlg.key);

       case 4: //Lock Thread
				LockTopicReason.setText("Locked at Admin Request");
				Canvas.pushDialog("GenDialog");
       case 5: //Unlock Thread
				TopicsPopupDlg.key = LaunchGui.key++;
    			TopicsPopupDlg.state = "unlockTopic";
				%fieldData = TopicsPopupMenu.topic.id;
			    DatabaseQuery(67,%fieldData,topicsPopupDlg,topicsPopupDlg.key);
       case 6: //Move Thread
				Canvas.pushDialog("MoveThreadDlg");
       case 7: //Not Implemented
              MessageBoxOK("NOTICE","Feature Not Yet Implemented");
       case 8: //Not Implemented
              MessageBoxOK("NOTICE","Feature Not Yet Implemented");
       case 9: //Not Implemented
              MessageBoxOK("NOTICE","Feature Not Yet Implemented");
       case 10: //Remove Topic
               TopicsPopupDlg.key = LaunchGui.key++;
               TopicsPopupDlg.state = "removeTopic";
               %fieldData = 0 TAB TopicsPopupMenu.topic.id TAB getField(TopicsPopupMenu.topic.rcvrec,11);
               databaseQuery(62, %fieldData, TopicsPopupDlg, TopicsPopupDlg.key);
   }           
   canvas.popDialog(TopicsPopupDlg);
}
//-----------------------------------------------------------------------------
function MoveThreadDlg::onWake(%this)
{
	MoveToForumList.clear();
	for(%i=0;%i<ForumsList.rowCount();%i++)
	{
		MoveToForumList.add(getField(ForumsList.getRowText(%i),0),ForumsList.getRowid(%i));
	}
}
//-----------------------------------------------------------------------------
function TopicsPopupMenu::ExecuteLock(%this)
{
	Canvas.popDialog("GenDialog");
    %fieldData = TopicsPopupMenu.topic.id TAB LockTopicReason.getText();
	TopicsPopupDlg.key = LaunchGui.key++;
    TopicsPopupDlg.state = "lockTopic";
    DatabaseQuery(66,%fieldData,topicsPopupDlg,topicsPopupDlg.key);
}
//-----------------------------------------------------------------------------
function TopicsPopupMenu::ExecuteMove(%this)
{
    %fieldData = TopicsPopupMenu.topic.id TAB MoveToForumList.getSelected() TAB MoveToForumList.getText();
	Canvas.popDialog("MoveThreadDlg");
	TopicsPopupDlg.key = LaunchGui.key++;
    TopicsPopupDlg.state = "moveTopic";
    DatabaseQuery(68,%fieldData,topicsPopupDlg,topicsPopupDlg.key);
}
//-----------------------------------------------------------------------------
function TopicsPopupDlg::onSleep(%this)
{
	ForumsGui.TDialogOpen = false;
}
//-----------------------------------------------------------------------------
function TopicsPopupDlg::onDatabaseQueryResult(%this,%status,%recordCount,%key)
{
   if(%this.key != %key)
       return;
	if(getField(%status,0)==0)
       if (%this.state $= "adminRemoveTopicPlus")
       {
           Email_TOEdit.setText(getField(%status,3));
           Email_CCEdit.setText("");
           switch(getField(%status,2))
           {
               case 1: $EmailSubject = "Policy Violation Warning";
               case 2: $EmailSubject = "Policy Violation Ban Notice : 24 hours";
               case 3: $EmailSubject = "Policy Violation Ban Notice : 48 hours";
               case 4: $EmailSubject = "Policy Violation Ban Notice : 72 hours";
               case 5: $EmailSubject = "Policy Violation Ban Notice : 7 Days";
               case 6: $EmailSubject = "Policy Violation Ban Notice : 30 Days";
               case 7: $EmailSubject = "Policy Violation Ban Notice : Indefinite";
           }
           EMailComposeDlg.state = "sendMail";
           Canvas.pushDialog(EmailComposeDlg);
           EmailBodyText.setValue("");
           Email_ToEdit.makeFirstResponder(1);
       }
       else
       {
			MessageBoxOK("NOTICE",getField(%status,1));
			switch$(%this.state)
			{
				case "lockTopic":
                     ForumsTopicsList.setRowStylebyID( ForumsTopicsList.getSelectedID(), 3 );
				case "unlockTopic":
                     ForumsTopicsList.setRowStylebyID( ForumsTopicsList.getSelectedID(), 1 );
				case "moveTopic":
                     ForumsTopicsList.setRowStylebyID( ForumsTopicsList.getSelectedID(), 3 );
					 ForumsTopicsList.removeRowByID(ForumsTopicsList.getSelectedID());
				case "removeTopic":					 					 
                     ForumsTopicsList.setRowStylebyID( ForumsTopicsList.getSelectedID(), 3 );
					 ForumsTopicsList.removeRowByID(ForumsTopicsList.getSelectedID());
			}
       }
   else
       messageBoxOK("ERROR",getField(%status,1));
}
//-----------------------------------------------------------------------------
function ForumsTopicsList::onSetSortKey( %this, %sortKey, %isIncreasing )
{
   $pref::Topics::SortColumnKey = %sortKey;
   $pref::Topics::SortInc = %isIncreasing;
}
//-----------------------------------------------------------------------------
function ForumsTopicsList::onColumnResize( %this, %column, %newSize )
{
   $pref::Topics::Column[%column] = %newSize;
}
//-----------------------------------------------------------------------------
function ForumsTopicsList::onSelect(%this)
{
	if(isEventPending(ForumsGUI.eid))
		cancel(ForumsGui.eid);
 	ForumsComposeDlg.topic = %this.getSelectedID();
}
//-----------------------------------------------------------------------------
function ForumsTopicsList::selectTopic( %this, %topic )
{
  %rowCount = %this.rowCount();
  for ( %row = 0; %row < %rowCount; %row++ )
  {
     if ( %topic $= getField( %this.getRowText( %row ), 0 ) )
     {
        %this.setSelectedById( %this.getRowId( %row ) );        
        break;
     }
  }
   if(%this.getSelectedID > -1)
       getTopicPosts();
   else
       if ( %row == %rowCount )
           warn( "\"" @ %topic @ "\" Topic not found!" );
}
//-----------------------------------------------------------------------------
function ForumsTopicsList::updateReadStatus( %this )
{
   for ( %row = 0; %row < %this.rowCount(); %row++ )
   {
      %style = 1; // unread
      %cacheFile = $ForumCachePath @ "tpc" @ %this.getRowId( %row );
      %file = new FileObject();
      if ( %file.openForRead( %cacheFile ) )
      {
         %header = %file.readLine();
         %topicDate = getField( %this.getRowText( %row ), 3 );
         %updateID = getField(%header,0);
         if ( getField( %header, 1 ) == $ForumCacheVersion        // Must have same cache version
              && getField( %header, 2 ) == 1                         // "all read" flag must be set
              && strcmp( getField( %header, 3 ), %topicDate ) >= 0
              && %updateID !$= "99999999" ) // date must be current
           %style = 0; // read
		  else if (%updateID $= "99999999")
           %style = 2; //ignored
         else
			%style = 1;
      }
      %file.delete();
      %this.setRowStyle( %row, %style );
   }
}
//-----------------------------------------------------------------------------
//-- ForumsMessageList -------------------------------------------------------
//-----------------------------------------------------------------------------
function ForumsMessageList::onAdd( %this )
{
   new GuiControl(PostsPopupDlg) {
      profile = "GuiModelessDialogProfile";
      horizSizing = "width";
      vertSizing = "height";
      position = "0 0";
      extent = "640 480";
      minExtent = "8 8";
      visible = "1";
      setFirstResponder = "0";
      modal = "1";

      new ShellPopupMenu( PostsPopupMenu ) {
         profile = "ShellPopupProfile";
         position = "0 0";
         extent = "0 0";
         minExtent = "0 0";
         visible = "1";
         maxPopupHeight = "200";
         noButtonStyle = "1";
      };
   };

   // Add the "Unread" style:
   %this.addStyle( 1, $ShellBoldFont, $ShellFontSize, "80 220 200", "30 255 225", "0 0 0" );
}
//-----------------------------------------------------------------------------
function ForumsMessageList::AddPost(%this, %id, %postname, %authorID, %authorName, %date, %mid, %slevel, %vline)
{
   if(!isObject(PostsListGroup))
       new SimGroup(PostsListGroup);
   %post = new scriptObject()
   {
      className = "TPost";
      Id = %id;
      name = %postname;
      author = %authorName;
      authorID = %authorID;
      date = %date;
      updateid = %mid;
      slevel = %slevel;
	   rcvrec = %vline;
   };
   PostsListGroup.Add(%post);
}
//-----------------------------------------------------------------------------
function ForumsMessageList::ClearList()
{
	if(isObject(PostsListGroup))
		PostsListGroup.Delete();
}
//-----------------------------------------------------------------------------
function ForumsMessageList::onRightMouseDown( %this, %column, %row, %mousePos )
{  
   ForumsMessageList.setSelectedRow(%row);
	PostsPopupMenu.post = PostsListGroup.getObject(%row);
   if ( trim(PostsPopupMenu.post.name) !$= "")
   {
      Canvas.pushDialog(PostsPopupDlg);
      PostsPopupMenu.position = %mousePos;
	   PostsPopupDlg.onWake();
	   PostsPopupMenu.forceOnAction();
   }
   else
      error( "Locate Error!" );
}
//-----------------------------------------------------------------------------
function PostsPopupDlg::onWake( %this )
{
	ForumsGui.TDialogOpen = true;
   PostsPopupMenu.clear();
   PostsPopupMenu.add( strUpr(PostsPopupMenu.post.author),0);
   %line = "------------------------------------------------";
   %line2 = "................................................";
   PostsPopupMenu.add(%line,-1);
	PostsPopupMenu.add( "EMAIL", 1 );
   PostsPopupMenu.add( "ADD To BUDDYLIST",2);
//   PostsPopupMenu.add( "INVITE TO CHAT",3);
//   PostsPopupMenu.add( "INSTANT MESSAGE",4);
//   PostsPopupMenu.add( "FOLLOW TO GAME (if playing)",5);
   if(isModerator())
   {
      PostsPopupMenu.add(%line2,-1);
      PostsPopupMenu.add( getsubstr(PostsPopupMenu.post.name,0,20) SPC ": REQUEST ADMIN REVIEW",9);
      if(isT2Admin())
          PostsPopupMenu.add( getsubstr(PostsPopupMenu.post.name,0,20) SPC ": REMOVE POST",10);
   }         
   Canvas.rePaint();      
}
//-----------------------------------------------------------------------------
function PostsPopupMenu::onSelect( %this, %id, %text )
{
//   echo("TPM RECV: " @ %id TAB %text);
   switch( %id )
   {
      case 0: LinkBrowser( PostsPopupMenu.post.author , "Warrior");
      case 1: //	0 EMAIL Post Author
	     	  LinkEMail(PostsPopupMenu.post.author);
//              MessageBoxOK("NOTICE","Feature Not Yet Implemented");
      case 2: //	1 ADD Post Author to your BuddyList
	   		  MessageBoxYesNo("CONFIRM","Add " @ PostsPopupMenu.post.author @ " to Buddy List?",
							  "LinkAddBuddy(\"" @ PostsPopupMenu.post.author @ "\",TWBText,\"addBuddy\");","");
//              MessageBoxOK("NOTICE","Feature Not Yet Implemented");
      case 3: //  2 INVITE Post Author To CHAT
              MessageBoxOK("NOTICE","Feature Not Yet Implemented");
      case 4: //  3 IMSG Post Author
              MessageBoxOK("NOTICE","Feature Not Yet Implemented");
      case 5: //  4 FOLLOW Post Author to game if is playing
              MessageBoxOK("NOTICE","Feature Not Yet Implemented");
       case 9: //Request Admin Review
               // FORUMID.TOPICID.POSTID.AUTHORID
               PostsPopupDlg.key = LaunchGui.key++;
               PostsPopupDlg.state = "requestPostReview";
               %fieldData = ForumsList.getSelectedID() TAB ForumsTopicsList.getSelectedID() TAB ForumsMessageList.getSelectedID() TAB PostsPopupMenu.post.authorID;
			   MessageBoxYesNo("CONFIRM","Request Admin Review?","PostsPopupMenu.adminCall(61,\"" @ %fieldData @ "\");","");
       case 10: //Remove Post
               PostsPopupDlg.key = LaunchGui.key++;
               PostsPopupDlg.state = "adminRemovePost";
               %fieldData = ForumsMessageList.getSelectedID();
			   MessageBoxYesNo("CONFIRM","Remove Post?","PostsPopupMenu.adminCall(14,\"" @ %fieldData @ "\");","");
//               %fieldData = 0 TAB ForumsList.getSelectedID() TAB ForumsTopicsList.getSelectedID() TAB ForumsMessageList.getSelectedID() TAB PostsPopupMenu.post.authorID;
//			   MessageBoxYesNo("CONFIRM","Remove Post?","PostsPopupMenu.adminCall(63,\"" @ %fieldData @ "\");","");
   }           
   canvas.popDialog(PostsPopupDlg);
}
//-----------------------------------------------------------------------------
function PostsPopupMenu::AdminCall(%this, %ord, %fields)
{
	databaseQuery(%ord, %fields, PostsPopupDlg, PostsPopupDlg.key);	
}
//-----------------------------------------------------------------------------
function PostsPopupDlg::onSleep(%this)
{
	ForumsGui.TDialogOpen = false;
}
//-----------------------------------------------------------------------------
function PostsPopupDlg::onDatabaseQueryResult(%this,%status,%recordCount,%key)
{
   if(%this.key != %key)
       return;
	if(getField(%status,0)==0)
   {
        %selRow = ForumsMessageList.getRowNumByID(PostsPopupMenu.post.id);
		if (%this.state $= "adminRemovePost")
		{
			MessageBoxOK("NOTICE",getField(%status,1));
			ForumsMessageVector.deleteLine( %selRow );
			ForumsMessageList.removeRow( %selRow );
			ForumsMessageList.setSelectedRow( %selRow );
			CacheForumTopic();
			%this.State = "done";			
		}
       if (%this.state $= "adminRemovePostPlus")
       {
			MessageBoxOK("NOTICE",getField(%status,1));
		   ForumsMessageVector.deleteLine( %selRow );
           ForumsMessageList.removeRow( %selRow );
           ForumsMessageList.setSelectedRow( %selRow );
  		    CacheForumTopic();
           Email_ToEdit.setText(getField(%status,3));
           Email_CCEdit.setText("");
           switch(getField(%status,2))
           {
               case 1: $EmailSubject = "Policy Violation Warning";
               case 2: $EmailSubject = "Policy Violation Ban Notice : 24 hours";
               case 3: $EmailSubject = "Policy Violation Ban Notice : 48 hours";
               case 4: $EmailSubject = "Policy Violation Ban Notice : 72 hours";
               case 5: $EmailSubject = "Policy Violation Ban Notice : 7 Days";
               case 6: $EmailSubject = "Policy Violation Ban Notice : 30 Days";
               case 7: $EmailSubject = "Policy Violation Ban Notice : Indefinite";
           }
           EMailComposeDlg.state = "sendMail";
           Canvas.pushDialog(EmailComposeDlg);
           EmailBodyText.setValue("");
           Email_ToEdit.makeFirstResponder(1);
       }
       else if (%this.state $= "requestPostReview")
       {
           MessageBoxOK("NOTICE",getField(%status,1));
       }
       else
       {
			ForumsMessageVector.deleteLine( %selRow );
			ForumsMessageList.removeRow( %selRow );
			ForumsMessageList.setSelectedRow( %selRow );
  		    CacheForumTopic();
			MessageBoxOK("NOTICE",getField(%status,1));
       }
   }
   else
       messageBoxOK("ERROR",getField(%status,1));
}
//-----------------------------------------------------------------------------
function ForumsMessageList::connectionTerminated(%this, %key)
{
	ForumShell.setTitle("FORUMS: " @ getField(ForumsList.getRowTextbyID(ForumsList.getSelectedID()),0));
}
//-----------------------------------------------------------------------------
function ForumsMessageList::loadCache( %this, %forumTID)
{
   ForumsMessageVector.clear();
   ForumsMessageList.clear();
   ForumsMessageVector.tid = %forumTID;   
   %this.lastId = 0;
   %this.highestUpdate = %this.lastID;
   %cacheFile = $ForumCachePath @ "tpc" @ ForumsComposeDlg.topic;
   %file = new FileObject();
   if ( %file.openForRead( %cacheFile ) )
   {
      if ( !%file.isEOF() )
      {
         // First line is the update id:
         %line = %file.readLine();
         if ( getField( %line, 1 ) == $ForumCacheVersion )
         {
            %this.lastID = getField(%line,0);
            %this.highestUpdate = %this.lastID;
            %this.allRead = getField(%line,2);
            %this.lastDate = getField(%line,3);
            if ( !%file.isEOF() )
            {
               // Second line is the message count:
               %line = %file.readLine();
               %count = getField( %line, 0 );

               // Now push all of the messages into the message vector:
                while ( !%file.isEOF() )
                {
					%line = %file.readLine();
                	%postId = firstWord( %line );
                	%text = collapseEscape( restWords( %line ) );
                   %date = getRecord(%text,5);
                   %isRead = getRecord(%text,0);

					// RESET THE FIELDS IF THE POST IS BEING VISITED BY THE AUTHOR.
				 	%ref = getRecord(%text,6);
                   if(%this.allRead && DateStrCompare(%this.lastDate,%date))
                       %text = setRecord( %text, 0, "1" );
                       
//                	echo( "** ADDING MESSAGE FROM CACHE - " @ %postId @ " **" );
                	ForumsMessageVector.pushBackLine( %text, %postId );
               }
            }
         }
      }
   }
   %file.delete();

   %numLines = ForumsMessageVector.getNumLines();
   for(%x=0;%x<%numLines;%x++)
   {
       %lineText = ForumsMessageVector.getLineText( %x );
  	    ForumsMessageAddRow( %lineText );
   }
   if(ForumsMessageList.getSelectedId() == -1)
       ForumsMessageList.setSelectedRow(0);

   for(%x=0;%x<%numLines;%x++)
   {
       %lineText = ForumsMessageVector.getLineTextbyTag( ForumsMessageList.getRowID(%x) );
       %ltID = getField(getRecord(%lineText,1),0);
       %ltSubject = getField(getRecord(%lineText,3),0);
       %ltAuthorID = getField(getRecord(%lineText,4),3);
       %ltAuthorName = getField(getRecord(%lineText,4),0);
       %ltDate = getField(getRecord(%lineText,5),0);
       %ltParentID = getField(getRecord(%lineText,2),0);
       
       if(%ltParentID == 0)
           %ltParentID = %ltID;
           
       %ltIsRead = getField(getRecord(%lineText,0),0);
       ForumsMessageList.addPost(%ltID, %ltSubject, %ltAuthorID, %ltAuthorName, %ltDate, %ltParentID, %ltIsRead, %lineText);
   }
   
}
//-----------------------------------------------------------------------------
function ForumsMessageList::onColumnResize( %this, %column, %newSize )
{
   $pref::Forum::Column[%column] = %newSize;
}
//-----------------------------------------------------------------------------
function ForumsMessageList::onSelect(%this, %id, %text)
{

	if(!ForumsMessageList.getSelectedID())
		%parentId = 0;
	else
		%parentId = ForumsMessageList.getSelectedId();

   ForumsComposeDlg.parentPost = %parentId;
   %rawText = ForumsMessageVector.getLineTextByTag( ForumsComposeDlg.parentPost );
	%offSet = 7;
   if ( getRecord( %rawText, 0 ) $= "0" )
   {
      // Set the "read" flag:
      %this.setRowStyleById( %id, 0 );
      %line = ForumsMessageVector.getLineIndexByTag( %parentId );
      ForumsMessageVector.deleteLine( %line );
      %rawText = setRecord( %rawText, 0, "1" );
      ForumsMessageVector.pushBackLine( %rawText, %parentId );
      CacheForumTopic();
   }
	%text = ForumsGetTextDisplay( %rawText,%offSet );
	ForumsText.setValue(%text);
	FO_ReplyBtn.setActive( true );
	FO_NextBtn.setActive( true );
	FO_PreviousBtn.setActive( true );
 	%ref = getRecord(%rawText,6);
   updatePostBtn(ForumsList.getSelectedID(),getField(getRecord(ForumsMessageVector.getLineTextbyTag(ForumsMessageList.getSelectedID()),4),3));
}
//-----------------------------------------------------------------------------
function ForumsMessagelist::onDatabaseQueryResult(%this,%status,%resultString,%key)
{
	if(%this.key != %key)
		return;
//	echo("RECV: " @ %status TAB %resultString);
	if(getField(%status,0)==0)
	{
		MessageBoxOK("COMPLETE",getField( %status, 1));
		switch$(%this.state)
		{
			case "replyPost":
               %this.state = "done";
				ForumsOpenThread();
			case "editPost":
               %this.state = "done";
          		%postId = getField( %status, 2 );
           		%index = ForumsMessageVector.getLineIndexByTag( %postId );
	           	%text = ForumsMessageVector.getLineTextByTag( %postId );
    	       	%parent = getRecord( %text, 2 );
          	    ForumsMessageVector.deleteLine( %index );
               %text = setRecord(%text,0,"1");
               ForumsMessageVector.pushBackLine(%text, %postID);
      		    CacheForumTopic();
               GetTopicPosts();
			case "deletePost":
				%this.state = "done";
          		%postId = getField( %status, 2 );
	           	%index = ForumsMessageVector.getLineIndexByTag( %postId );
    	       	%text = ForumsMessageVector.getLineTextByTag( %postId );
        	   	%parent = getRecord( %text, 2 );
 		    	ForumsTopicsList.refreshFlag = true;
          	    ForumsMessageVector.deleteLine( %index );
      		    CacheForumTopic();
            	if ( %parent != 0 )
            	{
               	    %row = ForumsMessageList.getRowNumById( %postId );
               	    ForumsMessageList.removeRowById( %postId );
               	    if ( %row < ForumsMessageList.rowCount() )
                        ForumsMessageList.setSelectedRow( %row );
               	    else
                	    ForumsMessageList.setSelectedRow( %row - 1 );
 
                    %this.state = "done";
 				    ForumsOpenThread();
            	}
            	else
            	{
   			  	    ForumsTopicsList.refreshFlag = true;
                    ForumsGoTopics(0);
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
		MessageBoxOK("ERROR",getFields(%status,1));
	}
   canvas.SetCursor(DefaultCursor);
}
//-----------------------------------------------------------------------------
function ForumsComposeDlg::onWake( %this )
{
   // Get the window pos and extent from prefs:
   %res = getResolution();
   %resW = firstWord( %res );
   %resH = getWord( %res, 1 );
   %w = firstWord( $pref::Forum::PostWindowExtent );
   if ( %w > %resW )
      %w = %resW;
   %h = getWord( $pref::Forum::PostWindowExtent, 1 );
   if ( %h > %resH )
      %h = %resH;
   %x = firstWord( $pref::Forum::PostWindowPos );
   if ( %x > %resW - %w )
      %x = %resW - %w;
   %y = getWord( $pref::Forum::PostWindowPos, 1 );
   if ( %y > %resH - %h )
      %y = %resH - %h;
   FC_Window.resize( %x, %y, %w, %h );
}
//-----------------------------------------------------------------------------
function ForumsComposeDlg::onSleep( %this )
{
   $pref::Forum::PostWindowPos = FC_Window.getPosition();
   $pref::Forum::PostWindowExtent = FC_Window.getExtent();
}

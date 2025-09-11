
function HTTPTest_onLine(%line)
{
   echo("HTTPLine: " @ %line);
   if($HTTPTest_notifyObject !$= "")
      $HTTPTest_notifyObject.onLine(%line, $HTTPTest_notifyKey);
}

function HTTPTest(%script, %query, %notifyObject, %notifyKey)
{
   echo("HTTPQuery: " @ %script);
   %query = "\n" @ %query;
   $HTTPTest_notifyObject = %notifyObject;
   $HTTPTest_notifyKey = %notifyKey;
   
   call("HTTPTest_" @ %script, %query);
   if($HTTPTest_notifyObject !$= "")
      $HTTPTest_notifyObject.connectionTerminated($HTTPTest_notifyKey);
   echo("HTTPQueryDone");
}

function HTTPTest_update_CreatePublicForum(%query)
{
   if($pref::forumCount $= "")
      $pref::forumCount = 0;
      
   $pref::ForumName[$pref::forumCount] = getRecord(%query, 1);
   $pref::forumCount++;
   HTTPTest_onLine("OK");
}

function HTTPTest_update_DeletePublicForum(%query)
{
   for(%i = 0; %i < $pref::forumCount; %i++)
   {
      if($pref::ForumName[%i] $= getRecord(%query, 1))
      {
         $pref::forumCount--;
         $pref::forumName[%i] = $pref::forumName[$pref::forumCount];
         HTTPTest_onLine("OK");
         return;
      }
   }
   HTTPTest_onLine("InvalidForum");
}

function HTTPTest_query_GetForumList(%query)
{
   if($pref::forumCount $= "")
      $pref::forumCount = 0;
   HTTPTest_onLine($pref::forumCount);
   for(%i = 0; %i < $pref::forumCount; %i++)
      HTTPTest_onLine($pref::forumName[%i]);
}

// post is:
// threadId
// PostEdit
// postid
// updateid
// parentid
// poster
// date
// topic
// body line 1
// body line 2
// ...

function HTTPTest_update_postforumentry(%query)
{
   %forum = getRecord(%query, 1);
   %parent = getRecord(%query, 2);
   %topic = getRecord(%query, 3);
   %body = getRecord(%query, 4);
   
   echo(%forum);
   echo(%parent);
   echo(%topic);
   echo(%body);
   
   for(%i = 5; %i < getRecordCount(%query); %i++)
      %body = %body @ "\n" @ getRecord(%query, %i);
   if(%parent == 0) // create a new thread for this one:
   {
      if($pref::forumThreadCount $= "")
         $pref::forumThreadCount = 0;
      %threadid = $pref::forumThreadCount;
      
      $pref::forumThread[$pref::forumThreadCount] = %forum @ "\n"@ "SuperD00D" TAB "[BSF]" TAB 1 TAB 4 TAB %topic TAB "Today" TAB %threadid TAB 0;
      $pref::forumThreadCount++;
   }
   else
   {
      %parentpost = $pref::forumPost[%parent];
      
      %threadId = getRecord(%parentpost, 0);
      echo(%threadId);
   }
   $pref::forumPostCount++;
   $pref::forumUpdateId++;
   $pref::forumPost[$pref::forumPostCount] = %threadId @ "\n" @ "PostEdit" @ "\n" @ $pref::forumPostCount @ "\n" @ $pref::forumUpdateId @ "\n" @
            %parent @ "\n" @ "SuperD00D" @ "\n" @ "Today" @ "\n" @ %topic @ "\n" @ %body;
   if(%notifyObject)
   {
      %notifyObject.onLine("OK");
      %notifyObject.connectionTerminated();
   }
}

function HTTPTest_query_GetForumTopics(%query)
{
   %count = 0;
   %list = "";
   %forum = getRecord(%query, 1);
   %start = getRecord(%query, 2);
   %maxCount = getRecord(%query, 3);
   %maxCount += %start;
   if(%maxCount > $pref::forumThreadCount)
      %maxCount = $pref::forumThreadCount;
   for(%i = %start; %i < %maxCount; %i++)
   {
      %thread = $pref::forumThread[%i];
      if(getRecord(%thread, 0) $= %forum)
      {
         %line[%count] = getRecord(%thread, 1);
         %count++;
      }
   }
   HTTPTest_onLine(%count);
   for(%i = 0; %i < %count; %i++)
      HTTPTest_onLine(%line[%i]);
}

// post is:
// threadId
// PostEdit
// postid
// updateid
// parentid
// poster
// date
// topic
// body line 1
// body line 2
// ...

function HTTPTest_query_GetForumUpdates(%query)
{
   %threadId = getRecord(%query, 1);
   %updateId = getRecord(%query, 2);
   
   %output = "";
   %updateCount = 0;
   
   for(%i = 1; %i <= $pref::forumPostCount; %i++)
   {
      %post = $pref::forumPost[%i];
      if(%threadId == getRecord(%post, 0) && %updateId < getRecord(%post, 3))
         %updateCount++;
   }
   HTTPTest_onLine(%updateCount);
   for(%i = 1; %i <= $pref::forumPostCount; %i++)
   {
      %post = $pref::forumPost[%i];
      if(%threadId == getRecord(%post, 0) && %updateId < getRecord(%post, 3))
      {
         %rc = getRecordCount(%post);
         HTTPTest_onLine(%rc - 1);
         for(%j = 1; %j < %rc; %j++)
            HTTPTest_onLine(getRecord(%post, %j));
      }
   }
}

function HTTPTest_update_editforumentry(%query)
{
   echo("Updating forum entry");
   %postId = getRecord(%query, 1);
   %post = $pref::forumPost[%postId];
   $pref::forumUpdateId++;
   %post = setRecord(%post, 3, $pref::forumUpdateId);
   %rc = getRecordCount(%query);
   
   for(%i = 2; %i < %rc; %i++)
      %post = setRecord(%post, 5 + %i, getRecord(%query, %i));
      
      
   %post = setRecord(%post, 5 + %i, "[Edited by blah blah blah]");
   %rc = getRecordCount(%post);

   for(%p = 0; %p < %rc; %p++)
      echo(getRecord(%post, %p));      

   for(%j = 0; %j <= 5 + %i; %j++)
      %newpost = setRecord(%newpost, %j, getRecord(%post, %j));
   $pref::forumPostCount++;
   $pref::forumPost[$pref::forumPostCount] = %newpost;
   echo("New post: ");
   %rc = getRecordCount(%newpost);

   for(%p = 0; %p < %rc; %p++)
      echo(getRecord(%newpost, %p));      
   HTTPTest_onLine("OK");
}

function HTTPTest_query_playerinfo(%query)
{
   HTTPTest_onLine("OK");
   HTTPTest_onLine("SuperD00D\t[BSF]\t1\t4");
   HTTPTest_onLine("1");
   HTTPTest_onLine("2");
   HTTPTest_onLine("Big Sucka Fishes");
   HTTPTest_onLine("Sofa Kings");
   HTTPTest_onLine("3");
   HTTPTest_onLine("Big Sucka Fishes\t[BSF]\t1\t1");
   HTTPTest_onLine("Sucka Fishes\t[SF]\t1\t1");
   HTTPTest_onLine("Sofa Kings\t[SOFAKING]\t1\t1");
   HTTPTest_onLine("4\t1");
   HTTPTest_onLine("I am SuperD00D<Font:Arial Bold:14> Master of the Big Sucka Fishes");
   HTTPTest_onLine("I am SuperD00D<Font:Arial Bold Italic:24> I R00LZ AT TRYB3S!");
   HTTPTest_onLine("I am SuperD00D<Font:Arial Bold:14> I think I should insert some links and stuff");
   HTTPTest_onLine("I am SuperD00D<Font:Arial Bold:14> I think I should insert some links and stuff");
   HTTPTest_onLine("2");
   HTTPTest_onLine("Created Tribe Big Sucka Fishes");
   HTTPTest_onLine("Created Tribe Sucka Fishes");
}

function HTTPTest_query_gettribeinformation(%query)
{
   HTTPTest_onLine("OK");
   HTTPTest_onLine("Big Sucka Fishes\t[BSF]\t1");
   HTTPTest_onLine("1\t1");
   HTTPTest_onLine("4\t1");
   HTTPTest_onLine("We are the BIG SUCKA FISHES.  We R00LZ 0V3R u. We R R33T.");
   HTTPTest_onLine("We 0WNZ T3H TRYB3S 2 Scene.");
   HTTPTest_onLine("The OGL is our collective bitch.");
   HTTPTest_onLine("Dave Georgeson is a big mo mo.");
   HTTPTest_onLine("5");
   HTTPTest_onLine("SuperD00D\t[BSF]\t1\t4\t2\tSupreme Leader\tWhenever\t1");
   HTTPTest_onLine("QIX\t[BSF]\t1\t5\t2\tGroupie\tWhenever\t0");
   HTTPTest_onLine("RatedZ\t[BSF]\t1\t7\t2\tFrench Teacher\tWhenever\t1");
   HTTPTest_onLine("Uberb0b\t[BSF]\t1\t8\t2\tWater Boy\tWhenever\t0");
   HTTPTest_onLine("Funkymonkey\t[BSF]\t1\t9\t2\tMascot\tWhenever\t1");
   HTTPTest_onLine("3");
   HTTPTest_onLine("Invitee1\t[DORK]\t1\t10\tSuperD00D\t[BSF]\t1\t4\t0");
   HTTPTest_onLine("Invitee2\t[DORK]\t1\t10\tSuperD00D\t[BSF]\t1\t4\t1");
   HTTPTest_onLine("Invitee3\t[DORK]\t1\t10\tSuperD00D\t[BSF]\t1\t4\t0");
}
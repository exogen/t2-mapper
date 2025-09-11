$IRCClient::NickName = getField(wonGetAuthInfo(),0);
$IRCClient::NickName = strReplace($IRCClient::NickName," ","_");
$IRCClient::NickName = stripChars($IRCClient::NickName,"~@#$!+%/|^{&*()<>");

package t2csri_ircfix {
function GetIRCServerList(%arg1) {
    return "IP:irc.arloria.net:6667";
}
function IRCClient::notify(%event)
{
   if (isObject(ServerConnection) && getSubStr(%event,0,9) $= "IDIRC_ERR") return;
   Parent::notify(%event);
}
function IRCClient::away(%params)
{
   %me = $IRCClient::people.getObject(0);
   %me.flags = %me.flags & ~$PERSON_AWAY;
   if (strlen(%params))
   {
      if ($IRCClient::awaytimeout)
      {
         cancel($IRCClient::awaytimeout);
         $IRCClient::awaytimeout = 0;
      }
      IRCClient::send("AWAY :" @ %params);
   } else IRCClient::send("AWAY");
}
function IRCTCP::onDisconnect(%this)
{
    $IRCClient::state = IDIRC_DISCONNECTED;
    IRCClient::reset();
    //IRCClient::notify(IDIRC_ERR_DROPPED);
    parent::onDisconnect(%this);
}
function IRCClient::onVersion(%prefix,%params)
{
   nextToken(%prefix,prefix,"!");
   parent::onVersion(%prefix,%params);
}
function IRCTCP::onConnected(%this)
{
    IRCClient::newMessage("","IRCClient: Established TCP/IP connection");
    %me = $IRCClient::people.getObject(0);
    %me.displayName = $IRCClient::NickName;
    %me.setName(%me.displayName);
    $IRCClient::tcp.schedule(500, "send", "NICK " @ $IRCClient::NickName @ "\r\n");
    $IRCClient::tcp.schedule(500, "send", "USER " @ $IRCClient::NickName @ " x x :" @ $IRCClient::NickName @ "\r\n");
    $IRCClient::tcp.schedule(2000, "send", "WHOIS " @ $IRCClient::NickName @ "\r\n");
    $IRCClient::state = IDIRC_CONNECTING_WAITING;
}
function IRCClient::relogin()
{
    if($IRCClient::state !$= IDIRC_CONNECTED)
      IRCClient::connect();
    %me = $IRCClient::people.getObject(0);
    %me.displayName = $IRCClient::NickName;
    %me.setName(%me.displayName);
    %me.tagged = %me.displayName;
    IRCClient::correctNick(%me);
    IRCClient::newMessage("","IRCClient: Reauthentication starting");
    $IRCClient::tcp.schedule(500, "send", "NICK " @ $IRCClient::NickName @ "\r\n");
    $IRCClient::tcp.schedule(500, "send", "USER " @ $IRCClient::NickName @ " x x :" @ $IRCClient::NickName @ "\r\n");
    $IRCClient::tcp.schedule(2000, "send", "WHOIS " @ $IRCClient::NickName @ "\r\n");
    $IRCClient::state = IDIRC_CONNECTING_WAITING;
}
function IRCClient::dispatch(%prefix,%command,%params)
{
    if (%command == 378) {IRCClient::onConFrom(%prefix,%params); return true;}
    else parent::dispatch(%prefix,%command,%params);
}
function chatMemberPopup::add(%this,%name,%index) {
    if (%index == 10 || %index == 11) return;
    parent::add(%this,%name,%index);
}
function JoinChatDlg::onWake(%this)
{
   if ($IRCClient::state $= IDIRC_CONNECTING_WAITING)
      MessageBoxOK("CONNECTING...","Waiting for IRC server to respond, please wait.");
   else
      parent::onWake(%this);
}
function ChatTabView::onSelect(%this,%obj,%name)
{
   parent::onSelect(%this,%obj,%name);
   if (%name $= "welcome" && $IRCClient::channels.getObject(0) != %obj)
   {
      ChatPanel.setVisible(true);
      WelcomePanel.setVisible(false);
      ChatEditOptionsBtn.setVisible(false);
   }
}
function IRCClient::onConFrom(%prefix,%params)
{
    //IP acquisition test... may remove
    //Krash-T2 Krash-T2 :is connecting from *@24.108.153.184 24.108.153.184
    if ($IPv4::InetAddress $= "" && getWord(%params,0) $= $IRCClient::people.getObject(0).displayName) $IPv4::InetAddress = getWord(%params,getWordCount(%params)-1);
}
function IRCClient::onBadNick(%prefix,%params)
{
    $IRCClient::NickName = getField(wonGetAuthInfo(),0) @ "-"@getRandom(0,99);
    $IRCClient::NickName = strReplace($IRCClient::NickName," ","_");
    IRCClient::relogin();
}
function IRCClient::onNick(%prefix,%params)
{
   %person = IRCClient::findPerson2(%prefix,false);
   if (%person) {
      %person.displayName = %params;
      %person.tagged = %params;
      IRCClient::correctNick(%person);
      ChatRoomMemberList_rebuild();
   }
   parent::onNick(%prefix,%params);

}
function IRCClient::newMessage(%channel,%message)
{
   //quick UE fix, rewrite later
   for (%i = 0;%i < getWordCount(%message);%i++) {
     %word = getWord(%message,%i);
     %first = strstr(%word,"<");
     if (%first != -1) {
       %word1 = getSubstr(%word,%first,strlen(%word));
       %second = strstr(%word1,">");
       if (%second == -1)
         %message = stripChars(%message,"<>");
     }
   }
   parent::newMessage(%channel,%message);
}
function IRCClient::setIdentity(%p,%ident)
{
   parent::setIdentity(%p,%ident);
   if(%p.getName() !$= %p.displayName) %p.setName(%p.displayName);
   if(%p.untagged $= "")%p.untagged = %p.displayName;
}
function IRCClient::onMode(%prefix,%params)
{
   parent::onMode(%prefix,%params);
   ChatRoomMemberList_rebuild();
}
function IRCClient::onJoinServer(%mission,%server,%address,%mayprequire,%prequire)
{
   if(strstr(strlwr($IRCClient::currentChannel.getName(),"tribes")) == -1) return;
   parent::onJoinServer(%mission,%server,%address,%mayprequire,%prequire);
}
function IRCClient::onNameReply(%prefix,%params)
{

   %params = strreplace(%params,"~","@");
   %params = strreplace(%params,"&","@");
   %params = strreplace(%params,"*","@");
   %params = strreplace(%params,"%","@");
   %params = strreplace(%params,"^","@");
   parent::onNameReply(%prefix,%params);
}
function IRCClient::onPing(%prefix,%params)
{
   //echo(%prefix SPC %params);
   if (!$PingStarted) {
      $IRCClient::tcp.schedule(1000, "send", "PONG " @ %params @ "\r\n");
      $PingStarted = true;
   } else $IRCClient::tcp.send("PONG " @ %params @ "\r\n");

}
function IRCClient::onPart(%prefix,%params)
{
   %params = firstWord(%params);
   parent::onPart(%prefix,%params);
   ChatRoomMemberList_rebuild();
}
function IRCClient::notify(%event)
{
   if (%event $= IDIRC_CHANNEL_LIST) {
         JoinChatList.clear();
         for (%i = 0; %i < $IRCClient::numChannels; %i++)
         {
            switch$ ( $IRCClient::channelNames[%i] ) {
               case "#the_construct" or "#help" or "#welcome":    %temp = 1;
               default: %temp = 0;
            }
            if (strStr(strlwr($IRCClient::channelNames[%i]),"tribes") != -1) %temp = 1;
            JoinChatList.addRow(%i, IRCClient::displayChannel( $IRCClient::channelNames[%i]) TAB $IRCClient::channelUsers[%i] TAB %temp );
            JoinChatList.setRowStyle( %i, %temp > 0 );
         }
         JoinChatList.sort();
         JoinChatName.onCharInput();
   } else parent::notify(%event);
}
}; activatePackage(t2csri_ircfix);

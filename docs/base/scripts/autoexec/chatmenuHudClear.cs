//Clear VoiceBind Chatmenu at spawn

package chatmenuHudClear 
{
	
function ClientCmdDisplayHuds() 
{
	parent::ClientCmdDisplayHuds();
	cancelChatMenu();
}

function clientCmdSetInventoryHudItem(%slot, %amount, %addItem)
{
	parent::clientCmdSetInventoryHudItem(%slot, %amount, %addItem);
	cancelChatMenu();
}
   
};


// Prevent package from being activated if it is already
if (!isActivePackage(chatmenuHudClear))
	activatePackage(chatmenuHudClear);
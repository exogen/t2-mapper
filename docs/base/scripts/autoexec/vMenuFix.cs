package FixVmenuPosition
{

function showChatMenuHud(){
    parent::showChatMenuHud();
    %height = ((getWord($pref::Video::resolution, 1) * 0.5) / $pref::Video::uiScale) - 75;
    //echo("Height: " @ %height);
    ChatMenuHud.position = "8" SPC %height;
}

};

//Prevent package from being activated if it is already
if (!isActivePackage(FixVmenuPosition))
    activatePackage(FixVmenuPosition);
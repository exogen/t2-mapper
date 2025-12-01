// #name = Launch Menu API
// #version = 1.0.0
// #date = April 10, 2001
// #category = Support
// #author = Lorne Laliberte
// #warrior = Writer
// #email = t2beta@cdnwriter.com
// #web = http://www.t2scripts.com
// #web = http://www.cdnwriter.com
// #description = Adds new commands to the LaunchToolbarMenu class so scripters can customize the launch menu
// #status = release
// #include = support/callback.cs
// ---------------------------------------------------------------------------

// Usage notes and examples:
//
// Note: the "id" referred to here is a value that gets passed to the onSelect()
//       function when a Launch Menu item is selected.
//
//       Be careful to use a unique id when adding an item to the launch menu!
//
//       Don't use id 72 for anything, that one's mine. :)
//
// LaunchToolbarMenu.getItemID(1);
//
//      -> returns the ID of the 2nd Launch Menu item (i.e. at position 1)
//
// LaunchToolbarMenu.getItemText(0);
//
//      -> returns the ID of the 1st Launch Menu item (i.e. at position 0)
//
// LaunchToolbarMenu.findItem(%id, %target_text, %occurence);
//
//      -> find an item by its id, by its text, or by both
//
// LaunchToolbarMenu.findItem(2, "GAME");
//
//      -> returns the current index of the item with ID = 2 and text = "GAME"
//
// LaunchToolbarMenu.findItem("", "--", 2);
//
//      -> returns the current index of the 2nd separator
//
// LaunchToolbarMenu.insertItemAt(0, 69, "GetItOn");
//
//      -> inserts an item at the start of the list (position 0) with the id 69
//         and the text "GetItOn"
//
// LaunchToolbarMenu.insertItemAt(0, 69, "GetItOn", "LaunchGetItOn();");
//
//      -> inserts an item at the start of the list (position 0) with the id 69
//         and the text "GetItOn" and attached "LaunchGetItOn();" to the callback
//         that will be triggered whenever the GetItOn item is selected
//
// LaunchToolbarMenu.insertItemAt(4, "", "--");
//
//      -> inserts a separator at position 4 in the launch menu
//
// LaunchToolbarMenu.insertItemAt(LaunchToolbarMenu.findItem(7, "SETTINGS"), 72, "SCRIPTS", "LaunchScriptBrowser();");
//
//      -> inserts my "SCRIPTS" item before the "SETTINGS" item in the launch menu,
//         assigns "72" as the ID for my "SCRIPTS" item, and sets "LaunchScriptBrowser();" as the function
//         that gets called whenever the "SCRIPTS" item is selected
//
// LaunchToolbarMenu.insertSeparatorAt(4);
//
//      -> inserts a separator at position 4 in the launch menu
//
// LaunchToolbarMenu.removeItemAt(7);
//
//      -> removes the item at position 7 in the menu
//
//   NOTE: you can't remove "root" or "original" items
//
//         Original items include Dynamix's stuff like "GAME" and "QUIT,"
//         as well as any items added without using this API
//
// LaunchToolbarMenu.removeSeparatorAt(3);
//
//      -> only removes the item at position 3 in the menu if it's a separator
//
//
// You should use the "LaunchMenuReady" callback to set up your launch items.
// Here's the code I use in autoload.cs to add the SCRIPTS item as soon as the
// Launch Menu is ready:
//
//    function SB_AddLaunchItem()
//    {
//        LaunchToolbarMenu.insertItemAt(LaunchToolbarMenu.findItem(7, "SETTINGS"), 72, "SCRIPTS", "LaunchScriptBrowser();");
//    }
//    callback.add(LaunchMenuReady, "SB_AddLaunchItem();");



function LaunchToolbarMenu::getItemID(%this, %index)
{
    return %this.api_public_item_id[%index];
}

function LaunchToolbarMenu::getItemText(%this, %index)
{
    return %this.api_public_item_text[%index];
}

function LaunchToolbarMenu::findItem(%this, %target_id, %target_text, %occurence)
{
    if(%occurence $= "")
        %occurence = 1;

    if( (%target_id !$= "") && (%target_text !$= "") )
    {
        // search for match on id and text
        
        for( %i = 0; %i < %this.api_public_item_count; %i++)
        {
            if( !stricmp(%this.api_public_item_text[%i], %target_text) &&
                !stricmp(%this.api_public_item_id[%i], %target_id) )
            {
                // item found with matching id and text
                %occurence--;

                if(!%occurence)
                    return %i;
            }
        }
    }
    else if ( %target_text !$= "" )
    {
        // search for match on text only

        for( %i = 0; %i < %this.api_public_item_count; %i++)
        {
            if( !stricmp(%this.api_public_item_text[%i], %target_text) )
            {
                // item found with matching text
                %occurence--;

                if(!%occurence)
                    return %i;
            }
        }
    }
    else if ( %target_id !$= "" )
    {
        // search for match on id only

        for( %i = 0; %i < %this.api_public_item_count; %i++)
        {
            if( !stricmp(%this.api_public_item_id[%i], %target_id) )
            {
                // item found with matching id
                %occurence--;

                if(!%occurence)
                    return %i;
            }
        }
    }
    return -1;
}

function LaunchToolbarMenu::insertItemAt(%this, %index, %id, %text, %func)
{
    // get the main (root) item for this index
    %main_index = %this.api_public_item_root[%index];

    %main_text = %this.api_main_item_text[%main_index];
    %main_repeat = %this.api_main_item_repeat[%main_index];

    %branch_count = %this.api_main_item_branch_count[%main_text, %main_repeat];
    
    if(%branch_count)
    {
        // get the branch index that corresponds to our target public index
        %branch_index = %this.api_branch_index[%index];

        // make room for another branch item
        for(%i = %this.api_main_item_branch_count[%main_text, %main_repeat]; %i > %branch_index; %i--)
        {
            %this.api_branch_item_id[%main_text, %main_repeat, %i] = %this.api_branch_item_id[%main_text, %main_repeat, %i - 1];
            %this.api_branch_item_text[%main_text, %main_repeat, %i] = %this.api_branch_item_text[%main_text, %main_repeat, %i - 1];
        } 
        
        // insert the branch item
        %this.api_branch_item_id[%main_text, %main_repeat, %branch_index] = %id;
        %this.api_branch_item_text[%main_text, %main_repeat, %branch_index] = %text;
        
        // increment the branch count
        %this.api_main_item_branch_count[%main_text, %main_repeat]++;
    }
    else
    {
        // no existing items, so add our item here
        %this.api_branch_item_id[%main_text, %main_repeat, 0] = %id;
        %this.api_branch_item_text[%main_text, %main_repeat, 0] = %text;

        // increment the branch count
        %this.api_main_item_branch_count[%main_text, %main_repeat]++;
    }

    if( (%func !$= "") && (%text !$= "--") )
    {
        callback.add("LaunchMenuID_" @ %id @ "_Selected", %func);
    }

    // refresh the launch menu (and the public item indices)
    LaunchToolbarDlg.onWake();    
}


function LaunchToolbarMenu::insertSeparatorAt(%this, %index)
{
    %this.insertItemAt(%index, "", "--");
}


function LaunchToolbarMenu::removeItemAt(%this, %index)
{
    // get the main (root) item for this index
    %main_index = %this.api_public_item_root[%index];

    if(%this.api_main_item_face[%main_index] == %index)
    {
        echo("Sorry, you can't remove any of the root Launch Menu items.");
        return;
    }

    %main_text = %this.api_main_item_text[%main_index];
    %main_repeat = %this.api_main_item_repeat[%main_index];

    %branch_count = %this.api_main_item_branch_count[%main_text, %main_repeat];
    
    // get the branch index that corresponds to our target public index
    %branch_index = %this.api_branch_index[%index];

    // remove this item
    for(%i = %branch_index; %i < %this.api_main_item_branch_count[%main_text, %main_repeat]; %i++)
    {
        %this.api_branch_item_id[%main_text, %main_repeat, %i] = %this.api_branch_item_id[%main_text, %main_repeat, %i + 1];
        %this.api_branch_item_text[%main_text, %main_repeat, %i] = %this.api_branch_item_text[%main_text, %main_repeat, %i + 1];
    } 
    
    // remove the previous last branch item (just a bit of cleanup)
    %this.api_branch_item_id[%main_text, %main_repeat, %i] = "";
    %this.api_branch_item_text[%main_text, %main_repeat, %i] = "";
    
    // decrement the branch count
    %this.api_main_item_branch_count[%main_text, %main_repeat]--;

    // shouldn't be necessary, but just in case:
    if(%this.api_main_item_branch_count[%main_text, %main_repeat] < 0)
        %this.api_main_item_branch_count[%main_text, %main_repeat] = 0;

    // refresh the launch menu (and the public item indices)
    LaunchToolbarDlg.onWake();    
}

function LaunchToolbarMenu::removeSeparatorAt(%this, %index)
{
    if(%this.api_public_item_text[%index] !$= "--")
    {
        echo("Target item isn't a separator. Nothing was removed.");
        return;
    }
    
    %this.removeItemAt(%index);
}


package LaunchMenuOverrides
{

function LaunchToolbarDlg::onWake(%this)
{
    parent::onWake(%this);

    if(!%this.api_awake)
    {
        %this.api_awake = true;
        callback.trigger(LaunchMenuReady);
    }
}

function LaunchToolbarMenu::clear(%this)
{
    for(%i = 0; %i < %this.api_main_item_count; %i++)
    {
        %text = %this.api_main_item_text[%i];
        %this.api_main_item_repeat_count[%text] = 0;
    }

    %this.api_main_item_count = 0;
    %this.api_public_item_count = 0;

    parent::clear(%this);
}

function LaunchToolbarMenu::add(%this, %id, %text)
{
    %main_index = %this.api_main_item_count + 0; // init to zero on first occurence

    %repeat_counter = %this.api_main_item_repeat_count[%text] + 0;

    %this.api_main_item_id[%main_index] = %id;
    %this.api_main_item_text[%main_index] = %text;
    %this.api_main_item_repeat[%main_index] = %repeat_counter;

    %public_index = %this.api_public_item_count + 0;
    
    // insert any branch items attached to this main item
    for(%i = 0; %i < %this.api_main_item_branch_count[%text, %repeat_counter]; %i++)
    {
        %branch_id = %this.api_branch_item_id[%text, %repeat_counter, %i];
        %branch_text = %this.api_branch_item_text[%text, %repeat_counter, %i];

        // make this branch index accessible by the corresponding public index
        %this.api_branch_index[%public_index] = %i;

        %this.api_public_item_id[%public_index] = %branch_id;
        %this.api_public_item_text[%public_index] = %branch_text;
        %this.api_public_item_root[%public_index] = %main_index;
        %public_index++;

        if(%branch_text $= "--")
            parent::addSeparator(%this);
        else
            parent::add(%this, %branch_id, %branch_text);
    }

    %this.api_public_item_id[%public_index] = %id;
    %this.api_public_item_text[%public_index] = %text;
    %this.api_public_item_root[%public_index] = %main_index;
    %this.api_main_item_face[%main_index] = %public_index;
    %public_index++;

    parent::add(%this, %id, %text);

    %this.api_main_item_count++;
    %this.api_public_item_count = %public_index;
}

function LaunchToolbarMenu::addSeparator(%this)
{
    %id = "";
    %text = "--";

    %main_index = %this.api_main_item_count + 0; // init to zero on first occurence

    %repeat_counter = %this.api_main_item_repeat_count[%text] + 0;

    %this.api_main_item_id[%main_index] = %id;
    %this.api_main_item_text[%main_index] = %text;
    %this.api_main_item_repeat[%main_index] = %repeat_counter;

    %public_index = %this.api_public_item_count + 0;
    
    // insert any branch items attached to this main item
    for(%i = 0; %i < %this.api_main_item_branch_count[%text, %repeat_counter]; %i++)
    {
        %branch_id = %this.api_branch_item_id[%text, %repeat_counter, %i];
        %branch_text = %this.api_branch_item_text[%text, %repeat_counter, %i];

        // make this branch index accessible by the corresponding public index
        %this.api_branch_index[%public_index] = %i;

        %this.api_public_item_id[%public_index] = %branch_id;
        %this.api_public_item_text[%public_index] = %branch_text;
        %this.api_public_item_root[%public_index] = %main_index;
        %public_index++;

        if(%branch_text $= "--")
            parent::addSeparator(%this);
        else
            parent::add(%this, %branch_id, %branch_text);
    }

    %this.api_public_item_id[%public_index] = %id;
    %this.api_public_item_text[%public_index] = %text;
    %this.api_public_item_root[%public_index] = %main_index;
    %this.api_main_item_face[%main_index] = %public_index;
    %public_index++;

    parent::addSeparator(%this);

    %this.api_main_item_count++;
    %this.api_public_item_count = %public_index;
}

function LaunchToolbarMenu::onSelect(%this, %id, %text)
{
    parent::onSelect(%this, %id, %text);
    
    callback.trigger(LaunchMenuItemSelected, %id, %text);
    callback.trigger("LaunchMenuID_" @ %id @ "_Selected", %text);
}

};
activatePackage(LaunchMenuOverrides);

//if(isObject(LaunchToolbarDlg))
//    LaunchToolbarDlg.onWake();

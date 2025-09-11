//--------------------------------------------------------------------------
//
// joystickBind.cs
//
//--------------------------------------------------------------------------

// Joystick functions:
function joystickMoveX(%val)
{
   $mvLeftAction = ( %val < 0.0 );
   $mvRightAction = ( %val > 0.0 );
}

function joystickMoveY(%val)
{
   $mvForwardAction = ( %val < 0.0 );
   $mvBackwardAction = ( %val > 0.0 );
}

function joyYaw(%val)
{
   $mvYaw += getMouseAdjustAmount( %val );
}

function joyPitch(%val)
{
   $mvPitch += getMouseAdjustAmount( %val );
}
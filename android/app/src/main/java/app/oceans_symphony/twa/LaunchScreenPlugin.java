package app.oceans_symphony.twa;

import android.app.Activity;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Lets the web app say "the first screen is ready" so the launch screen
 * can go away. Until then MainActivity keeps the system launch screen up
 * (with a time limit), instead of showing a half-built page while the
 * data loads. Called from JS via src/lib/launchCover.js.
 */
@CapacitorPlugin(name = "LaunchScreen")
public class LaunchScreenPlugin extends Plugin {

    @PluginMethod
    public void hide(PluginCall call) {
        Activity activity = getActivity();
        if (activity instanceof MainActivity) {
            ((MainActivity) activity).releaseLaunchScreen();
        }
        call.resolve();
    }
}

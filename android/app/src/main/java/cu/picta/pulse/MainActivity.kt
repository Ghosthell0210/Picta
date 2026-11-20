package cu.picta.pulse

import android.graphics.Color
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.SystemBarStyle
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.viewModels
import cu.picta.pulse.ui.PictaPulseRoot
import cu.picta.pulse.ui.state.AppViewModel
import cu.picta.pulse.ui.theme.PictaPulseTheme

class MainActivity : ComponentActivity() {

    private val appViewModel: AppViewModel by viewModels()

    override fun onCreate(savedInstanceState: Bundle?) {
        enableEdgeToEdge(
            statusBarStyle = SystemBarStyle.dark(Color.TRANSPARENT),
            navigationBarStyle = SystemBarStyle.dark(Color.TRANSPARENT)
        )
        super.onCreate(savedInstanceState)

        setContent {
            PictaPulseTheme {
                PictaPulseRoot(viewModel = appViewModel)
            }
        }
    }
}

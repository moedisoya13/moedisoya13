namespace Capsomnia.Core;

public enum SleepHelperMode
{
    On,
    Off,
}

/// <summary>
/// System-facing operations the state machine drives. Implemented with real
/// powercfg/schtasks calls in the app and with fakes in tests.
/// </summary>
public interface ISleepActions
{
    /// <summary>Applies the keep-awake state (elevated helper). True when the state was applied.</summary>
    bool RunHelper(SleepHelperMode mode);

    /// <summary>Reads whether lid-close sleep is currently disabled. Null when unknown.</summary>
    bool? ReadLidSleepDisabled();

    /// <summary>Reads the lid state. Null when the device does not report one.</summary>
    bool? ReadLidClosed();

    /// <summary>Asks the OS to turn the display off. True when the request was delivered.</summary>
    bool RequestDisplaySleep();

    void Log(string message);
}

/// <summary>
/// Port of the original CapsomniaApp apply/verify/retry logic: applies the
/// Caps Lock state to the system sleep setting, verifies it periodically,
/// detects drift, and backs off after failures.
/// </summary>
public sealed class SleepStateMachine
{
    public static readonly TimeSpan HelperRetryInterval = TimeSpan.FromSeconds(5);
    public static readonly TimeSpan VerificationInterval = TimeSpan.FromSeconds(10);

    private readonly ISleepActions _actions;

    private bool? _failedSleepState;
    private DateTime _nextSleepStateRetryAt = DateTime.MinValue;
    private DateTime _nextSleepStateVerificationAt = DateTime.MinValue;
    private DateTime _nextDisplaySleepRetryAt = DateTime.MinValue;
    private bool _didRequestDisplaySleepForClosedLid;
    private bool _hasLoggedMissingLidState;
    private bool _hasLoggedMissingSleepState;

    public SleepStateMachine(ISleepActions actions)
    {
        _actions = actions;
    }

    /// <summary>The state Capsomnia last applied, if any.</summary>
    public bool? LastAppliedState { get; private set; }

    /// <summary>True while the helper failed and the machine is backing off.</summary>
    public bool HasError => _failedSleepState is not null;

    public bool DisplaySleepOnLidClose { get; set; } = true;

    public void Apply(bool capsLockOn, string reason, DateTime now)
    {
        if (_failedSleepState == capsLockOn && now < _nextSleepStateRetryAt)
        {
            return;
        }

        if (LastAppliedState == capsLockOn)
        {
            if (_failedSleepState is null && now < _nextSleepStateVerificationAt)
            {
                EvaluateDisplaySleepForClosedLid(capsLockOn, reason, now);
                return;
            }

            var actualState = _actions.ReadLidSleepDisabled();
            if (actualState is null)
            {
                if (!_hasLoggedMissingSleepState)
                {
                    _actions.Log($"{reason} sleep_state_unavailable");
                    _hasLoggedMissingSleepState = true;
                }

                MarkSleepStateFailed(capsLockOn, now);
                return;
            }

            _hasLoggedMissingSleepState = false;
            if (actualState == capsLockOn)
            {
                MarkSleepStateConfirmed(capsLockOn, reason, now);
                return;
            }

            _actions.Log(
                $"{reason} sleep_state_drift expected={OnOff(capsLockOn)} actual={OnOff(actualState.Value)}");
        }

        var mode = capsLockOn ? SleepHelperMode.On : SleepHelperMode.Off;
        var succeeded = _actions.RunHelper(mode);
        _actions.Log($"{reason} capslock={OnOff(capsLockOn)} helper_ok={succeeded}");

        if (!succeeded)
        {
            MarkSleepStateFailed(capsLockOn, now, resetVerification: false);
            return;
        }

        LastAppliedState = capsLockOn;
        var confirmedState = _actions.ReadLidSleepDisabled();
        if (confirmedState != capsLockOn)
        {
            _hasLoggedMissingSleepState = confirmedState is null;
            _actions.Log(
                $"{reason} sleep_state_confirmation_failed expected={OnOff(capsLockOn)} "
                    + $"actual={(confirmedState is null ? "unknown" : OnOff(confirmedState.Value))}");
            MarkSleepStateFailed(capsLockOn, now);
            return;
        }

        MarkSleepStateConfirmed(capsLockOn, reason, now);
    }

    private void MarkSleepStateFailed(bool capsLockOn, DateTime now, bool resetVerification = true)
    {
        _failedSleepState = capsLockOn;
        _nextSleepStateRetryAt = now + HelperRetryInterval;
        if (resetVerification)
        {
            _nextSleepStateVerificationAt = _nextSleepStateRetryAt;
        }
    }

    private void MarkSleepStateConfirmed(bool capsLockOn, string reason, DateTime now)
    {
        _hasLoggedMissingSleepState = false;
        _failedSleepState = null;
        _nextSleepStateRetryAt = DateTime.MinValue;
        _nextSleepStateVerificationAt = now + VerificationInterval;
        EvaluateDisplaySleepForClosedLid(capsLockOn, reason, now);
    }

    private void EvaluateDisplaySleepForClosedLid(bool capsLockOn, string reason, DateTime now)
    {
        if (!DisplaySleepOnLidClose || !capsLockOn)
        {
            _didRequestDisplaySleepForClosedLid = false;
            _nextDisplaySleepRetryAt = DateTime.MinValue;
            return;
        }

        var lidClosed = _actions.ReadLidClosed();
        if (lidClosed is null)
        {
            _didRequestDisplaySleepForClosedLid = false;
            if (!_hasLoggedMissingLidState)
            {
                _actions.Log($"{reason} lid_state_unavailable");
                _hasLoggedMissingLidState = true;
            }

            return;
        }

        _hasLoggedMissingLidState = false;
        if (!lidClosed.Value)
        {
            _didRequestDisplaySleepForClosedLid = false;
            _nextDisplaySleepRetryAt = DateTime.MinValue;
            return;
        }

        if (_didRequestDisplaySleepForClosedLid || now < _nextDisplaySleepRetryAt)
        {
            return;
        }

        var succeeded = _actions.RequestDisplaySleep();
        _actions.Log($"{reason} lid=closed display_sleep_ok={succeeded}");
        if (succeeded)
        {
            _didRequestDisplaySleepForClosedLid = true;
            _nextDisplaySleepRetryAt = DateTime.MinValue;
        }
        else
        {
            _nextDisplaySleepRetryAt = now + HelperRetryInterval;
        }
    }

    private static string OnOff(bool value) => value ? "on" : "off";
}

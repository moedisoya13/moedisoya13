using Capsomnia.Core;
using Xunit;

namespace Capsomnia.Tests;

public class SleepStateMachineTests
{
    private sealed class FakeActions : ISleepActions
    {
        public bool HelperResult = true;
        public bool? LidSleepDisabled = false;
        public bool? LidClosed = false;
        public bool DisplaySleepResult = true;
        public bool SyncLidStateWithHelper = true;

        public List<SleepHelperMode> HelperCalls = [];
        public int DisplaySleepRequests;
        public int SleepStateReads;
        public List<string> LogLines = [];

        public bool RunHelper(SleepHelperMode mode)
        {
            HelperCalls.Add(mode);
            if (HelperResult && SyncLidStateWithHelper)
            {
                LidSleepDisabled = mode == SleepHelperMode.On;
            }

            return HelperResult;
        }

        public bool? ReadLidSleepDisabled()
        {
            SleepStateReads++;
            return LidSleepDisabled;
        }

        public bool? ReadLidClosed() => LidClosed;

        public bool RequestDisplaySleep()
        {
            DisplaySleepRequests++;
            return DisplaySleepResult;
        }

        public void Log(string message) => LogLines.Add(message);
    }

    private static readonly DateTime T0 = new(2026, 1, 1, 0, 0, 0, DateTimeKind.Utc);

    [Fact]
    public void AppliesCapsLockOnAtStartup()
    {
        var actions = new FakeActions();
        var machine = new SleepStateMachine(actions);

        machine.Apply(capsLockOn: true, "startup", T0);

        Assert.Equal([SleepHelperMode.On], actions.HelperCalls);
        Assert.True(machine.LastAppliedState);
        Assert.False(machine.HasError);
    }

    [Fact]
    public void DoesNotRerunHelperWhileStateIsUnchangedInsideVerificationWindow()
    {
        var actions = new FakeActions();
        var machine = new SleepStateMachine(actions);

        machine.Apply(true, "startup", T0);
        actions.SleepStateReads = 0;
        machine.Apply(true, "poll", T0 + TimeSpan.FromSeconds(1));
        machine.Apply(true, "poll", T0 + TimeSpan.FromSeconds(9));

        Assert.Single(actions.HelperCalls);
        Assert.Equal(0, actions.SleepStateReads);
    }

    [Fact]
    public void VerifiesStateAfterVerificationInterval()
    {
        var actions = new FakeActions();
        var machine = new SleepStateMachine(actions);

        machine.Apply(true, "startup", T0);
        actions.SleepStateReads = 0;
        machine.Apply(true, "poll", T0 + SleepStateMachine.VerificationInterval);

        Assert.Single(actions.HelperCalls);
        Assert.Equal(1, actions.SleepStateReads);
    }

    [Fact]
    public void RerunsHelperWhenDriftIsDetected()
    {
        var actions = new FakeActions();
        var machine = new SleepStateMachine(actions);

        machine.Apply(true, "startup", T0);
        // Something outside Capsomnia re-enabled lid sleep.
        actions.LidSleepDisabled = false;
        machine.Apply(true, "poll", T0 + SleepStateMachine.VerificationInterval);

        Assert.Equal([SleepHelperMode.On, SleepHelperMode.On], actions.HelperCalls);
        Assert.Contains(actions.LogLines, line => line.Contains("sleep_state_drift"));
        Assert.False(machine.HasError);
    }

    [Fact]
    public void BacksOffAfterHelperFailureAndRetriesAfterInterval()
    {
        var actions = new FakeActions { HelperResult = false };
        var machine = new SleepStateMachine(actions);

        machine.Apply(true, "startup", T0);
        Assert.True(machine.HasError);
        Assert.Single(actions.HelperCalls);

        // Inside the back-off window: no retry.
        machine.Apply(true, "poll", T0 + TimeSpan.FromSeconds(4));
        Assert.Single(actions.HelperCalls);

        // After the back-off window: retry succeeds and the error clears.
        actions.HelperResult = true;
        machine.Apply(true, "poll", T0 + SleepStateMachine.HelperRetryInterval);
        Assert.Equal(2, actions.HelperCalls.Count);
        Assert.False(machine.HasError);
    }

    [Fact]
    public void CapsLockChangeDuringBackOffAppliesImmediately()
    {
        var actions = new FakeActions { HelperResult = false };
        var machine = new SleepStateMachine(actions);

        machine.Apply(true, "startup", T0);
        actions.HelperResult = true;

        // The failure back-off is keyed to the failed state; the opposite state
        // must not be delayed.
        machine.Apply(false, "poll", T0 + TimeSpan.FromSeconds(1));

        Assert.Equal([SleepHelperMode.On, SleepHelperMode.Off], actions.HelperCalls);
        Assert.False(machine.HasError);
    }

    [Fact]
    public void MarksErrorWhenSleepStateIsUnavailable()
    {
        var actions = new FakeActions { HelperResult = true, SyncLidStateWithHelper = false, LidSleepDisabled = null };
        var machine = new SleepStateMachine(actions);

        machine.Apply(true, "startup", T0);

        Assert.True(machine.HasError);
        Assert.Contains(actions.LogLines, line => line.Contains("sleep_state_confirmation_failed"));
    }

    [Fact]
    public void MarksErrorWhenConfirmationDisagrees()
    {
        var actions = new FakeActions { SyncLidStateWithHelper = false, LidSleepDisabled = false };
        var machine = new SleepStateMachine(actions);

        machine.Apply(true, "startup", T0);

        Assert.True(machine.HasError);
    }

    [Fact]
    public void RequestsDisplaySleepOnceWhenLidClosesWithCapsLockOn()
    {
        var actions = new FakeActions { LidClosed = true };
        var machine = new SleepStateMachine(actions) { DisplaySleepOnLidClose = true };

        machine.Apply(true, "startup", T0);
        machine.Apply(true, "poll", T0 + TimeSpan.FromSeconds(1));
        machine.Apply(true, "poll", T0 + TimeSpan.FromSeconds(2));

        Assert.Equal(1, actions.DisplaySleepRequests);
    }

    [Fact]
    public void RequestsDisplaySleepAgainAfterLidReopens()
    {
        var actions = new FakeActions { LidClosed = true };
        var machine = new SleepStateMachine(actions) { DisplaySleepOnLidClose = true };

        machine.Apply(true, "startup", T0);
        Assert.Equal(1, actions.DisplaySleepRequests);

        actions.LidClosed = false;
        machine.Apply(true, "poll", T0 + TimeSpan.FromSeconds(1));

        actions.LidClosed = true;
        machine.Apply(true, "poll", T0 + TimeSpan.FromSeconds(2));
        Assert.Equal(2, actions.DisplaySleepRequests);
    }

    [Fact]
    public void DoesNotRequestDisplaySleepWhenPreferenceIsOff()
    {
        var actions = new FakeActions { LidClosed = true };
        var machine = new SleepStateMachine(actions) { DisplaySleepOnLidClose = false };

        machine.Apply(true, "startup", T0);

        Assert.Equal(0, actions.DisplaySleepRequests);
    }

    [Fact]
    public void DoesNotRequestDisplaySleepWhenCapsLockIsOff()
    {
        var actions = new FakeActions { LidClosed = true };
        var machine = new SleepStateMachine(actions) { DisplaySleepOnLidClose = true };

        machine.Apply(false, "startup", T0);

        Assert.Equal(0, actions.DisplaySleepRequests);
    }

    [Fact]
    public void RetriesDisplaySleepAfterFailureInterval()
    {
        var actions = new FakeActions { LidClosed = true, DisplaySleepResult = false };
        var machine = new SleepStateMachine(actions) { DisplaySleepOnLidClose = true };

        machine.Apply(true, "startup", T0);
        Assert.Equal(1, actions.DisplaySleepRequests);

        // Within the retry window nothing happens.
        machine.Apply(true, "poll", T0 + TimeSpan.FromSeconds(2));
        Assert.Equal(1, actions.DisplaySleepRequests);

        machine.Apply(true, "poll", T0 + SleepStateMachine.HelperRetryInterval);
        Assert.Equal(2, actions.DisplaySleepRequests);
    }

    [Fact]
    public void LogsMissingLidStateOnlyOnce()
    {
        var actions = new FakeActions { LidClosed = null };
        var machine = new SleepStateMachine(actions) { DisplaySleepOnLidClose = true };

        machine.Apply(true, "startup", T0);
        machine.Apply(true, "poll", T0 + TimeSpan.FromSeconds(1));
        machine.Apply(true, "poll", T0 + TimeSpan.FromSeconds(2));

        Assert.Equal(1, actions.LogLines.Count(line => line.Contains("lid_state_unavailable")));
    }

    [Fact]
    public void TogglingOffRunsHelperOff()
    {
        var actions = new FakeActions();
        var machine = new SleepStateMachine(actions);

        machine.Apply(true, "startup", T0);
        machine.Apply(false, "poll", T0 + TimeSpan.FromSeconds(1));

        Assert.Equal([SleepHelperMode.On, SleepHelperMode.Off], actions.HelperCalls);
        Assert.False(machine.LastAppliedState);
    }
}

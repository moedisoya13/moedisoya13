// Browser entry: every source file has registered by now.
BD.finalize();
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', BD.client.shell.start);
else BD.client.shell.start();

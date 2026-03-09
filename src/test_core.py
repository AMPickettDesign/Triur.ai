import pytest
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

def test_server_imports():
    """Test that all server modules can be imported."""
    import server
    assert server is not None

def test_actions_imports():
    """Test that actions module can be imported."""
    import actions
    assert actions is not None

def test_brain_imports():
    """Test that brain module can be imported."""
    import brain
    assert brain is not None

def test_memory_imports():
    """Test that memory module can be imported."""
    import memory
    assert memory is not None

def test_emotions_imports():
    """Test that emotions module can be imported."""
    import emotions
    assert emotions is not None

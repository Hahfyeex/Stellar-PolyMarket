#!/usr/bin/env python3
"""
Stress Test Runner for Stellar PolyMarket
Executes Taurus stress tests and generates comprehensive reports
"""

import subprocess
import sys
import os
import json
from datetime import datetime

def check_dependencies():
    """Verify required dependencies are installed"""
    print("🔍 Checking dependencies...")
    
    # Check for bzt (Taurus)
    try:
        result = subprocess.run(['bzt', '--version'], capture_output=True, text=True)
        print(f"✅ Taurus installed: {result.stdout.strip()}")
    except FileNotFoundError:
        print("❌ Taurus not found. Install with: pip install bzt")
        return False
    
    # Check if backend is running
    try:
        import requests
        response = requests.get('http://localhost:4000/health', timeout=5)
        if response.status_code == 200:
            print("✅ Backend server is running")
        else:
            print("⚠️  Backend server returned non-200 status")
            return False
    except Exception as e:
        print(f"❌ Backend server not accessible: {e}")
        print("   Start the backend with: cd backend && npm start")
        return False
    
    return True

def run_stress_test():
    """Execute the Taurus stress test suite"""
    print("\n🚀 Starting stress test suite...")
    print("=" * 60)
    
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    report_dir = f"stress-test-results/{timestamp}"
    os.makedirs(report_dir, exist_ok=True)
    
    # Run Taurus with HTML report generation
    cmd = [
        'bzt',
        'stress-test.yml',
        '-o', f'modules.blazemeter.report-name=stress-test-{timestamp}',
        '-o', f'settings.artifacts-dir={report_dir}'
    ]
    
    try:
        result = subprocess.run(cmd, check=False)
        
        if result.returncode == 0:
            print("\n✅ Stress test completed successfully!")
            print(f"📊 Results saved to: {report_dir}")
            return True
        else:
            print("\n⚠️  Stress test completed with failures")
            print(f"📊 Results saved to: {report_dir}")
            return False
            
    except KeyboardInterrupt:
        print("\n⚠️  Test interrupted by user")
        return False
    except Exception as e:
        print(f"\n❌ Error running stress test: {e}")
        return False

def analyze_results(report_dir):
    """Analyze test results and print summary"""
    print("\n📈 Test Results Summary")
    print("=" * 60)
    
    # Look for kpi.jtl file (Taurus output)
    kpi_file = os.path.join(report_dir, 'kpi.jtl')
    if os.path.exists(kpi_file):
        print(f"✅ Detailed metrics available in: {kpi_file}")
    
    print("\n💡 Key Metrics to Review:")
    print("  - Throughput: requests/second handled")
    print("  - p95 Latency: 95th percentile response time (must be < 2s)")
    print("  - Error Rate: percentage of failed requests (must be < 1%)")
    print("  - Concurrent Users: maximum simultaneous users supported")
    
    print("\n🔍 Check the HTML report for detailed visualizations")

def main():
    """Main execution flow"""
    print("🎯 Stellar PolyMarket - Throughput Stress Test Suite")
    print("=" * 60)
    
    # Check dependencies
    if not check_dependencies():
        print("\n❌ Dependency check failed. Please resolve issues and try again.")
        sys.exit(1)
    
    # Run stress test
    success = run_stress_test()
    
    # Analyze results
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    report_dir = f"stress-test-results/{timestamp}"
    analyze_results(report_dir)
    
    # Exit with appropriate code for CI
    sys.exit(0 if success else 1)

if __name__ == "__main__":
    main()

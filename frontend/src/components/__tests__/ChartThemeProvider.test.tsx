import { render, screen } from "@testing-library/react";
import { ChartThemeProvider, useChartTheme } from "../ChartThemeProvider";
import { useChartColors } from "../../hooks/useChartColors";

// Mock the hook
jest.mock("../../hooks/useChartColors");

const mockUseChartColors = useChartColors as jest.MockedFunction<typeof useChartColors>;
const mockDarkColors = { yes: "#22c55e", no: "#f97316" /* abbreviated */ };

describe("ChartThemeProvider", () => {
  beforeEach(() => {
    mockUseChartColors.mockReturnValue(mockDarkColors);
  });

  it("provides colors via context", () => {
    const TestComponent = () => {
      const colors = useChartTheme();
      return <div data-testid="colors">{colors.yes}</div>;
    };

    render(
      <ChartThemeProvider>
        <TestComponent />
      </ChartThemeProvider>
    );

    expect(screen.getByTestId("colors")).toHaveTextContent("#22c55e");
  });

  it("re-renders children when colors change", () => {
    const TestComponent = jest.fn(() => (
      <div data-testid="consumer">{mockUseChartColors().yes}</div>
    ));

    const { rerender } = render(
      <ChartThemeProvider>
        <TestComponent />
      </ChartThemeProvider>
    );

    mockUseChartColors.mockReturnValue({ yes: "#059669", no: "#dc2626" });

    rerender(
      <ChartThemeProvider>
        <TestComponent />
      </ChartThemeProvider>
    );

    expect(TestComponent).toHaveBeenCalledTimes(2);
    expect(screen.getByTestId("consumer")).toHaveTextContent("#059669");
  });

  it("throws when useChartTheme used outside provider", () => {
    const TestComponent = () => {
      useChartTheme(); // Should throw
      return null;
    };

    expect(() => render(<TestComponent />)).toThrow(
      "useChartTheme must be used within ChartThemeProvider"
    );
  });
});
